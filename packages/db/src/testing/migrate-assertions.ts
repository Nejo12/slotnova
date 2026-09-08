/**
 * Migration test utilities (FR-063, SC-011, `docs/standards/ci-quality-gates.md`
 * "Database/migration gates").
 *
 * Two reusable checks that every migration-bearing PR runs against real
 * PostgreSQL:
 *
 *   - {@link assertCleanMigration}  — all migrations apply to an empty database
 *     and are idempotent on re-run
 *   - {@link assertForwardMigration} — migrations apply forward onto a
 *     representative populated prior state without data loss
 *
 * Both are generic: they take a migrations directory and (for the forward case)
 * caller-supplied seed/verify callbacks. Module-specific expectations live with
 * the module.
 */
import { Client } from "pg";

import { getPendingMigrations, loadMigrations, runMigrations } from "../migrate.js";
import { withIsolatedDatabase } from "./isolation.js";

export interface CleanMigrationResult {
  readonly appliedVersions: string[];
}

/**
 * Apply every migration in `migrationsDir` to a throwaway database, assert none
 * remain pending, and assert a second run applies nothing (idempotent).
 */
export async function assertCleanMigration(options: {
  adminUri: string;
  migrationsDir: string;
}): Promise<CleanMigrationResult> {
  const { adminUri, migrationsDir } = options;

  return withIsolatedDatabase(adminUri, async ({ databaseUri }) => {
    const first = await runMigrations({ connectionString: databaseUri, migrationsDir });

    const known = await loadMigrations(migrationsDir);
    if (first.applied.length !== known.length) {
      throw new Error(
        `expected clean apply to run all ${known.length} migration(s), ran ${first.applied.length}`,
      );
    }

    const client = new Client({ connectionString: databaseUri });
    await client.connect();
    try {
      const pending = await getPendingMigrations(client, migrationsDir);
      if (pending.length > 0) {
        throw new Error(
          `after a clean apply ${pending.length} migration(s) are still pending: ${pending
            .map((m) => m.filename)
            .join(", ")}`,
        );
      }
    } finally {
      await client.end();
    }

    const second = await runMigrations({ connectionString: databaseUri, migrationsDir });
    if (second.applied.length !== 0) {
      throw new Error(
        `migration runner is not idempotent: a second run applied ${second.applied.length} migration(s)`,
      );
    }

    return { appliedVersions: first.applied.map((m) => m.version) };
  });
}

/**
 * Prove a forward migration from a representative populated state:
 *
 *   1. apply migrations with `version < stopBefore`
 *   2. run `seed` to populate representative rows for that older schema
 *   3. apply the remaining migrations
 *   4. run `verify` to assert the seeded data survived
 *
 * Requires at least one migration on each side of `stopBefore`.
 */
export async function assertForwardMigration<S>(options: {
  adminUri: string;
  migrationsDir: string;
  stopBefore: string;
  seed: (client: Client) => Promise<S>;
  verify: (client: Client, seeded: S) => Promise<void>;
}): Promise<void> {
  const { adminUri, migrationsDir, stopBefore, seed, verify } = options;

  const all = await loadMigrations(migrationsDir);
  const before = all.filter((m) => m.version.localeCompare(stopBefore, "en") < 0);
  const after = all.filter((m) => m.version.localeCompare(stopBefore, "en") >= 0);
  if (before.length === 0 || after.length === 0) {
    throw new Error(
      `assertForwardMigration needs migrations on both sides of ${stopBefore} ` +
        `(before: ${before.length}, at/after: ${after.length})`,
    );
  }
  const lastBefore = before[before.length - 1] as (typeof before)[number];

  await withIsolatedDatabase(adminUri, async ({ databaseUri }) => {
    await runMigrations({
      connectionString: databaseUri,
      migrationsDir,
      targetVersion: lastBefore.version,
    });

    const client = new Client({ connectionString: databaseUri });
    await client.connect();
    try {
      const seeded = await seed(client);
      await runMigrations({ connectionString: databaseUri, migrationsDir });
      await verify(client, seeded);
    } finally {
      await client.end();
    }
  });
}
