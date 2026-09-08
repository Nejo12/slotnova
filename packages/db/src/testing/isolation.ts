/**
 * Isolated-database / isolated-schema helpers for commit-required tests.
 *
 * `docs/testing/strategy.md` §5: tests that need real commits (locking,
 * constraint interaction, concurrent workers) cannot use transaction rollback —
 * they run against a throwaway database or schema that is dropped afterwards.
 */
import { randomBytes } from "node:crypto";

import { Client } from "pg";
import type { ClientBase } from "pg";

function randomSuffix(): string {
  return randomBytes(6).toString("hex");
}

function quoteIdent(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function withDatabasePath(uri: string, database: string): string {
  const url = new URL(uri);
  url.pathname = `/${database}`;
  return url.toString();
}

export interface IsolatedDatabaseContext {
  readonly databaseName: string;
  /** Admin-role URI for the throwaway database. */
  readonly databaseUri: string;
  /** Admin-role URI for the original (maintenance) database. */
  readonly adminUri: string;
}

/**
 * Create a fresh database, run `fn`, then drop it (with `FORCE`, terminating any
 * lingering connections). `adminUri` must point at a privileged role able to
 * `CREATE DATABASE`.
 */
export async function withIsolatedDatabase<T>(
  adminUri: string,
  fn: (context: IsolatedDatabaseContext) => Promise<T>,
  options: { prefix?: string } = {},
): Promise<T> {
  const { prefix = "slotnova_test" } = options;
  const databaseName = `${prefix}_${randomSuffix()}`;

  const maintenance = new Client({ connectionString: adminUri });
  await maintenance.connect();
  try {
    await maintenance.query(`CREATE DATABASE ${quoteIdent(databaseName)}`);
  } finally {
    await maintenance.end();
  }

  try {
    return await fn({
      databaseName,
      databaseUri: withDatabasePath(adminUri, databaseName),
      adminUri,
    });
  } finally {
    const cleanup = new Client({ connectionString: adminUri });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`);
    } finally {
      await cleanup.end();
    }
  }
}

/**
 * Create a fresh schema on an existing connection, point `search_path` at it,
 * run `fn`, then drop the schema `CASCADE` and restore `search_path`. Lighter
 * than a whole database when the test only needs table isolation.
 */
export async function withIsolatedSchema<T>(
  client: ClientBase,
  fn: (schemaName: string) => Promise<T>,
  options: { prefix?: string } = {},
): Promise<T> {
  const { prefix = "test" } = options;
  const schemaName = `${prefix}_${randomSuffix()}`;

  const { rows } = await client.query<{ search_path: string }>("SHOW search_path");
  const previousSearchPath = rows[0]?.search_path ?? '"$user", public';

  await client.query(`CREATE SCHEMA ${quoteIdent(schemaName)}`);
  await client.query(`SET search_path TO ${quoteIdent(schemaName)}, public`);
  try {
    return await fn(schemaName);
  } finally {
    await client.query(`SET search_path TO ${previousSearchPath}`);
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
  }
}
