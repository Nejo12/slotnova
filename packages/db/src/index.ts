/**
 * `@slotnova/db` — database infrastructure only.
 *
 * This package provides the shared PostgreSQL client factory, provider-neutral
 * configuration, and the gated migration runner. It owns exactly one table,
 * `schema_migrations` (migration-runner bookkeeping), and **no** business or
 * domain schema — those live in each backend module's infrastructure layer
 * (ADR-004).
 *
 * The real-PostgreSQL test harness is a separate entry point: `@slotnova/db/testing`.
 */
export {
  DB_ENV,
  DbConfigError,
  resolveDbConfig,
  type DbConnectionConfig,
  type DbRole,
  type DbSslMode,
  type Env,
} from "./config.js";

export {
  Client,
  Pool,
  assertNonBypassRlsRole,
  createDirectClient,
  createPool,
  withClient,
  withTransaction,
  type PoolClient,
  type Queryable,
} from "./client.js";

export {
  DEFAULT_MIGRATIONS_DIR,
  MigrationError,
  SCHEMA_MIGRATIONS_TABLE,
  checksumOf,
  getPendingMigrations,
  loadMigrations,
  runMigrations,
  type AppliedMigration,
  type MigrateResult,
  type MigrationFile,
  type RunMigrationsOptions,
} from "./migrate.js";
