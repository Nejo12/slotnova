/**
 * Real-PostgreSQL test harness (Testcontainers).
 *
 * ADR-006 layer 5 / FR-048: database behaviour — migrations, RLS, extensions,
 * constraints, transactions, locking, concurrency — is proved against a real
 * PostgreSQL server, never a mock, SQLite or in-memory substitute.
 *
 * {@link startPostgres} boots a container and provisions two roles, mirroring
 * the production split (data-model "Tenant context contract"):
 *
 *   - the container's own superuser is the **privileged / migration** role
 *   - a freshly-created `slotnova_app` role is the **RLS-subject application**
 *     role: `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, and — by
 *     PostgreSQL default — `NOBYPASSRLS`
 *
 * Both connection URIs are returned so a test can migrate as the privileged role
 * and then exercise tenant behaviour as the RLS-subject role.
 */
import { Client } from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Pinned PostgreSQL image. PostgreSQL 18 is the research baseline (research R1);
 * the `postgres` image bundles the contrib modules, so `btree_gist` (needed for
 * exclusion constraints from Booking onward, ADR-011) is installable.
 */
export const DEFAULT_POSTGRES_IMAGE = "postgres:18-alpine";

export const APP_ROLE = "slotnova_app";
const APP_PASSWORD = "slotnova_app_pw";

export interface StartPostgresOptions {
  image?: string;
  /** Name of the RLS-subject application role to create. */
  appRole?: string;
  appPassword?: string;
}

export interface PostgresHarness {
  readonly container: StartedPostgreSqlContainer;
  /** Privileged superuser URI — use for the migration runner and role/grant setup. */
  readonly adminUri: string;
  /** RLS-subject application-role URI — use for tenant behaviour assertions. */
  readonly appUri: string;
  readonly appRole: string;
  readonly database: string;
  readonly host: string;
  readonly port: number;
  /** Build an app-role URI pointing at a different database on the same server. */
  appUriForDatabase(database: string): string;
  /** Build an admin URI pointing at a different database on the same server. */
  adminUriForDatabase(database: string): string;
  stop(): Promise<void>;
}

function withDatabasePath(uri: string, database: string): string {
  const url = new URL(uri);
  url.pathname = `/${database}`;
  return url.toString();
}

function swapCredentials(uri: string, user: string, password: string): string {
  const url = new URL(uri);
  url.username = user;
  url.password = password;
  return url.toString();
}

/**
 * Start a PostgreSQL container and provision the RLS-subject application role.
 * The caller owns the lifecycle and must call {@link PostgresHarness.stop}.
 */
export async function startPostgres(options: StartPostgresOptions = {}): Promise<PostgresHarness> {
  const {
    image = DEFAULT_POSTGRES_IMAGE,
    appRole = APP_ROLE,
    appPassword = APP_PASSWORD,
  } = options;

  const container = await new PostgreSqlContainer(image).start();
  const adminUri = container.getConnectionUri();
  const database = container.getDatabase();
  const host = container.getHost();
  const port = container.getPort();

  const admin = new Client({ connectionString: adminUri });
  await admin.connect();
  try {
    // CREATE ROLE is a utility statement — it cannot take bind parameters, so
    // the (controlled, test-only) password is inlined as a quoted literal.
    await admin.query(
      `CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD ${quoteLiteral(appPassword)} ` +
        `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
    );
    // Baseline access; migrations own table-level grants.
    await admin.query(
      `GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(appRole)}`,
    );
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(appRole)}`);
  } finally {
    await admin.end();
  }

  const appUri = swapCredentials(adminUri, appRole, appPassword);

  return {
    container,
    adminUri,
    appUri,
    appRole,
    database,
    host,
    port,
    appUriForDatabase: (db) => withDatabasePath(appUri, db),
    adminUriForDatabase: (db) => withDatabasePath(adminUri, db),
    stop: () => container.stop().then(() => undefined),
  };
}

function quoteIdent(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Open `count` genuinely independent connections (separate sessions, not a
 * pool). Concurrency tests (FR-046, ADR-006) must overlap real connections;
 * sequential calls on one client are not a concurrency test. The caller ends
 * each client.
 */
export async function openIndependentConnections(
  connectionString: string,
  count: number,
): Promise<Client[]> {
  const clients = Array.from({ length: count }, () => new Client({ connectionString }));
  await Promise.all(clients.map((client) => client.connect()));
  return clients;
}
