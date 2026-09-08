/**
 * Gated SQL migration runner.
 *
 * Design rules (ADR-020, FR-060, data-model "SchemaMigration"):
 *
 *   - migrations are plain reviewed `.sql` files under `migrations/`, named
 *     `NNNN_snake_case_name.sql` (>= 4 digit, strictly-increasing version)
 *   - `packages/db` owns the `schema_migrations` bookkeeping table; no backend
 *     module owns it
 *   - the runner is invoked **only** as an explicit step (`pnpm db:migrate` or a
 *     test helper). It is never imported by an application bootstrap path, so
 *     migrations cannot run implicitly on startup
 *   - `drizzle-kit push` and other schema-diff shortcuts are not used anywhere
 *
 * Each migration runs in its own transaction unless the file's first line is
 * `-- slotnova:no-transaction` (for statements such as `CREATE INDEX
 * CONCURRENTLY` that cannot run inside a transaction block).
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import type { ClientBase } from "pg";

/** Default location of the reviewed migration files shipped with this package. */
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";

const MIGRATION_FILENAME = /^(?<version>\d{4,})_(?<name>[a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const NO_TRANSACTION_DIRECTIVE = "-- slotnova:no-transaction";

// A fixed key so concurrent runners serialise on one Postgres advisory lock.
const ADVISORY_LOCK_KEY = 8_534_771_002_931; // "slotnova.schema_migrations"

export interface MigrationFile {
  readonly version: string;
  readonly name: string;
  readonly filename: string;
  readonly sql: string;
  readonly checksum: string;
  readonly runInTransaction: boolean;
}

export interface AppliedMigration {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: Date;
}

export interface MigrateResult {
  readonly applied: readonly MigrationFile[];
  readonly skipped: readonly AppliedMigration[];
}

export class MigrationError extends Error {
  override name = "MigrationError";
}

export function checksumOf(sql: string): string {
  // Normalise line endings so the checksum is stable across platforms.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** Load, validate and order the migration files in a directory. */
export async function loadMigrations(
  dir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new MigrationError(`migrations directory does not exist: ${dir}`);
    }
    throw error;
  }

  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();
  const byVersion = new Map<string, MigrationFile>();

  for (const filename of sqlFiles) {
    const match = MIGRATION_FILENAME.exec(filename);
    if (!match?.groups) {
      throw new MigrationError(
        `migration file "${filename}" does not match the required NNNN_snake_case_name.sql convention`,
      );
    }
    const { version, name } = match.groups as { version: string; name: string };
    if (byVersion.has(version)) {
      throw new MigrationError(`duplicate migration version ${version} (${filename})`);
    }
    const sql = await readFile(path.join(dir, filename), "utf8");
    if (sql.trim() === "") {
      throw new MigrationError(`migration file "${filename}" is empty`);
    }
    byVersion.set(version, {
      version,
      name,
      filename,
      sql,
      checksum: checksumOf(sql),
      runInTransaction: !sql.startsWith(NO_TRANSACTION_DIRECTIVE),
    });
  }

  return [...byVersion.values()].sort((a, b) => a.version.localeCompare(b.version, "en"));
}

async function ensureBookkeepingTable(client: ClientBase): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.${SCHEMA_MIGRATIONS_TABLE} (
      version     text        PRIMARY KEY,
      name        text        NOT NULL,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readApplied(client: ClientBase): Promise<Map<string, AppliedMigration>> {
  const { rows } = await client.query<{
    version: string;
    name: string;
    checksum: string;
    applied_at: Date;
  }>(`SELECT version, name, checksum, applied_at FROM public.${SCHEMA_MIGRATIONS_TABLE}`);
  return new Map(
    rows.map((r) => [
      r.version,
      { version: r.version, name: r.name, checksum: r.checksum, appliedAt: r.applied_at },
    ]),
  );
}

export interface RunMigrationsOptions {
  /** An already-connected privileged client. Mutually exclusive with `connectionString`. */
  client?: ClientBase;
  /** A privileged connection string; the runner opens and closes its own client. */
  connectionString?: string;
  migrationsDir?: string;
  /** Apply only migrations with `version <= targetVersion` (inclusive). */
  targetVersion?: string;
  logger?: (message: string) => void;
}

/**
 * Apply every pending migration (optionally up to `targetVersion`). Safe to run
 * repeatedly: already-applied migrations are verified by checksum and skipped.
 * A checksum mismatch on an applied migration is a hard error (the reviewed file
 * changed after it shipped).
 */
export async function runMigrations(options: RunMigrationsOptions = {}): Promise<MigrateResult> {
  const {
    client: providedClient,
    connectionString,
    migrationsDir = DEFAULT_MIGRATIONS_DIR,
    targetVersion,
    logger = () => {},
  } = options;

  if (providedClient && connectionString) {
    throw new MigrationError("pass either `client` or `connectionString`, not both");
  }
  if (!providedClient && !connectionString) {
    throw new MigrationError(
      "runMigrations requires a privileged `client` or `connectionString` (no implicit connection)",
    );
  }

  const ownsClient = !providedClient;
  const client: ClientBase =
    providedClient ?? new Client({ connectionString, application_name: "slotnova-migration" });
  if (ownsClient) {
    await (client as Client).connect();
  }

  try {
    const migrations = await loadMigrations(migrationsDir);
    const pending = targetVersion
      ? migrations.filter((m) => m.version.localeCompare(targetVersion, "en") <= 0)
      : migrations;

    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    try {
      await ensureBookkeepingTable(client);
      const applied = await readApplied(client);

      // A migration recorded as applied but no longer present on disk means the
      // reviewed history diverged — refuse rather than guess.
      for (const version of applied.keys()) {
        if (!migrations.some((m) => m.version === version)) {
          throw new MigrationError(
            `migration ${version} is recorded as applied but no matching file exists in ${migrationsDir}`,
          );
        }
      }

      const newlyApplied: MigrationFile[] = [];
      const skipped: AppliedMigration[] = [];

      for (const migration of pending) {
        const record = applied.get(migration.version);
        if (record) {
          if (record.checksum !== migration.checksum) {
            throw new MigrationError(
              `migration ${migration.version} (${migration.filename}) was modified after it was applied ` +
                `(recorded checksum ${record.checksum.slice(0, 12)}…, file checksum ${migration.checksum.slice(0, 12)}…)`,
            );
          }
          skipped.push(record);
          continue;
        }

        logger(`applying ${migration.filename}`);
        if (migration.runInTransaction) {
          await client.query("BEGIN");
          try {
            await client.query(migration.sql);
            await recordMigration(client, migration);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw new MigrationError(
              `migration ${migration.filename} failed: ${(error as Error).message}`,
              { cause: error },
            );
          }
        } else {
          try {
            await client.query(migration.sql);
            await recordMigration(client, migration);
          } catch (error) {
            throw new MigrationError(
              `non-transactional migration ${migration.filename} failed and may be partially applied: ` +
                (error as Error).message,
              { cause: error },
            );
          }
        }
        newlyApplied.push(migration);
      }

      logger(
        newlyApplied.length === 0
          ? "database is up to date; no migrations applied"
          : `applied ${newlyApplied.length} migration(s)`,
      );
      return { applied: newlyApplied, skipped };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    if (ownsClient) {
      await (client as Client).end();
    }
  }
}

async function recordMigration(client: ClientBase, migration: MigrationFile): Promise<void> {
  await client.query(
    `INSERT INTO public.${SCHEMA_MIGRATIONS_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
    [migration.version, migration.name, migration.checksum],
  );
}

/** Versions present on disk that have not yet been recorded as applied. */
export async function getPendingMigrations(
  client: ClientBase,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<MigrationFile[]> {
  const migrations = await loadMigrations(migrationsDir);
  await ensureBookkeepingTable(client);
  const applied = await readApplied(client);
  return migrations.filter((m) => !applied.has(m.version));
}
