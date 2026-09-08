/**
 * `@slotnova/db/testing` — the real-PostgreSQL test harness.
 *
 * Separate entry point so `testcontainers` never enters an application bundle.
 * Later module tests import their DB harness from here (ADR-006, FR-048).
 */
export {
  APP_ROLE,
  DEFAULT_POSTGRES_IMAGE,
  openIndependentConnections,
  startPostgres,
  type PostgresHarness,
  type StartPostgresOptions,
} from "./pg-container.js";

export { withRolledBackTransaction } from "./transactions.js";

export {
  withIsolatedDatabase,
  withIsolatedSchema,
  type IsolatedDatabaseContext,
} from "./isolation.js";

export {
  assertCleanMigration,
  assertForwardMigration,
  type CleanMigrationResult,
} from "./migrate-assertions.js";

export {
  assertRlsCoverage,
  findTenantTables,
  getRlsCoverage,
  type TableRef,
  type TableRlsStatus,
} from "./rls-coverage.js";
