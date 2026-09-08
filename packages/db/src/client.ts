/**
 * PostgreSQL client factory.
 *
 * Exposes the shared connection primitives every backend module builds on:
 *
 *   - {@link createPool}          a pooled `app`-role connection for request paths
 *   - {@link createDirectClient}  a single unpooled session (migrations, and the
 *                                 genuinely-independent connections concurrency
 *                                 tests require — FR-046)
 *   - {@link withTransaction}     a `BEGIN`/`COMMIT`/`ROLLBACK` wrapper
 *   - {@link assertNonBypassRlsRole} a runtime guard that the connected role is
 *                                 subject to RLS (never `BYPASSRLS`, never
 *                                 superuser) — ADR-008, data-model contract
 *
 * `packages/db` owns no business schema (ADR-004); there is no ORM model or
 * table definition here.
 */
import { Client, Pool } from "pg";
import type { ClientBase, PoolClient } from "pg";

import { resolveDbConfig, type DbRole, type Env } from "./config.js";

export { Client, Pool };
export type { PoolClient } from "pg";

/** Any object able to run a parameterised query (a `Pool`, `Client` or `PoolClient`). */
export interface Queryable {
  query(queryText: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

function statementTimeoutOption(
  ms: number | undefined,
): { statement_timeout: number } | Record<string, never> {
  return ms === undefined ? {} : { statement_timeout: ms };
}

/**
 * Create a connection pool for a role (default `app`). The pool is created
 * lazily-connected; callers own its lifecycle and must call `pool.end()`.
 */
export function createPool(role: DbRole = "app", env: Env = process.env): Pool {
  const config = resolveDbConfig(role, env);
  return new Pool({
    connectionString: config.connectionString,
    ssl: config.ssl,
    application_name: config.applicationName,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    ...statementTimeoutOption(config.statementTimeoutMillis),
  });
}

/**
 * Create a single unpooled client for a role. Used by the migration runner and
 * by concurrency tests that need genuinely separate sessions. The caller owns
 * `client.connect()` / `client.end()`.
 */
export function createDirectClient(role: DbRole = "app", env: Env = process.env): Client {
  const config = resolveDbConfig(role, env);
  return new Client({
    connectionString: config.connectionString,
    ssl: config.ssl,
    application_name: config.applicationName,
    ...statementTimeoutOption(config.statementTimeoutMillis),
  });
}

/** Acquire a pooled client, run `fn`, always release. */
export async function withClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Run `fn` inside a single transaction on a pooled client. Commits on success,
 * rolls back on any thrown error, and always releases the client.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  return withClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

interface RoleAttributes {
  role: string;
  isSuperuser: boolean;
  bypassRls: boolean;
}

async function currentRoleAttributes(executor: ClientBase): Promise<RoleAttributes> {
  const { rows } = await executor.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    `SELECT rolname, rolsuper, rolbypassrls
       FROM pg_roles
      WHERE rolname = current_user`,
  );
  const row = rows[0];
  if (!row) {
    throw new Error("could not resolve current_user in pg_roles");
  }
  return { role: row.rolname, isSuperuser: row.rolsuper, bypassRls: row.rolbypassrls };
}

/**
 * Assert the connected role is a legitimate RLS subject: not a superuser and
 * not `BYPASSRLS`. Throws otherwise. Call this against an `app` connection in
 * tests and readiness checks so a misconfigured privileged role can never
 * silently serve tenant traffic (ADR-008).
 */
export async function assertNonBypassRlsRole(executor: ClientBase): Promise<void> {
  const attrs = await currentRoleAttributes(executor);
  const violations: string[] = [];
  if (attrs.isSuperuser) violations.push("is a superuser (superusers bypass RLS)");
  if (attrs.bypassRls) violations.push("has the BYPASSRLS attribute");
  if (violations.length > 0) {
    throw new Error(
      `database role "${attrs.role}" must be subject to row-level security but ${violations.join(" and ")}`,
    );
  }
}
