/**
 * Provider-neutral database configuration.
 *
 * `packages/db` never encodes a managed-provider choice (FR-065 is a later
 * founder decision). Configuration is resolved from standard connection
 * information only — a connection URI plus a handful of pool/SSL knobs — so any
 * PostgreSQL provider that speaks the wire protocol works unchanged.
 *
 * Two roles are kept strictly separate (ADR-004, ADR-008, data-model
 * "Tenant context contract"):
 *
 *   - `app`       the RLS-subject application role. It is **never** `BYPASSRLS`
 *                 and never a superuser. All tenant-owned queries run through it.
 *   - `migration` the privileged role used *only* by the gated migration runner
 *                 (`pnpm db:migrate`) and never by application request paths.
 */

import { isHosted, resolveEnvironment } from "@slotnova/deployment-config";

export type DbRole = "app" | "migration";

/** SSL negotiation mode, provider-neutral. */
export type DbSslMode = "disable" | "require" | "no-verify";

export interface DbConnectionConfig {
  readonly role: DbRole;
  readonly connectionString: string;
  readonly ssl: false | { rejectUnauthorized: boolean };
  readonly applicationName: string;
  readonly poolMax: number;
  readonly connectionTimeoutMillis: number;
  readonly idleTimeoutMillis: number;
  /** `undefined` leaves the server default in place. */
  readonly statementTimeoutMillis: number | undefined;
}

export type Env = Record<string, string | undefined>;

/** Environment variable names. Deliberately generic — no provider branding. */
export const DB_ENV = {
  appUrl: "DATABASE_URL",
  migrationUrl: "DATABASE_MIGRATION_URL",
  ssl: "DATABASE_SSL",
  poolMax: "DATABASE_POOL_MAX",
  connectTimeoutMs: "DATABASE_CONNECT_TIMEOUT_MS",
  idleTimeoutMs: "DATABASE_IDLE_TIMEOUT_MS",
  statementTimeoutMs: "DATABASE_STATEMENT_TIMEOUT_MS",
  applicationName: "DATABASE_APP_NAME",
} as const;

export class DbConfigError extends Error {
  override name = "DbConfigError";
}

function parseIntEnv(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new DbConfigError(
      `${name} must be a non-negative integer, received: ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function parseSsl(raw: string | undefined): DbConnectionConfig["ssl"] {
  const mode = (raw ?? "disable").trim().toLowerCase();
  switch (mode) {
    case "":
    case "disable":
    case "false":
    case "0":
      return false;
    case "require":
    case "true":
    case "1":
      return { rejectUnauthorized: true };
    case "no-verify":
    case "allow":
    case "prefer":
      // Local/preview opt-in only; hosted guard rejects this mode before parsing.
      // nosemgrep: tooling.security.no-disabled-tls-verification
      return { rejectUnauthorized: false };
    default:
      throw new DbConfigError(
        `${DB_ENV.ssl} must be one of disable | require | no-verify, received: ${JSON.stringify(raw)}`,
      );
  }
}

const DEFAULT_POOL_MAX: Record<DbRole, number> = {
  // Application traffic is pooled; the migration runner uses a single session.
  app: 10,
  migration: 1,
};

/**
 * Resolve connection configuration for a role from an environment map
 * (defaults to `process.env`). Throws {@link DbConfigError} when the required
 * connection string for the role is absent — the caller must supply it
 * explicitly; there is no implicit localhost fallback.
 */
export function resolveDbConfig(role: DbRole, env: Env = process.env): DbConnectionConfig {
  const urlVar = role === "app" ? DB_ENV.appUrl : DB_ENV.migrationUrl;
  const connectionString = env[urlVar]?.trim();
  if (!connectionString) {
    throw new DbConfigError(
      `${urlVar} is required to create a ${role} database connection but was not set`,
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DbConfigError(`${urlVar} must be a PostgreSQL URL`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2
  )
    throw new DbConfigError(`${urlVar} must name a PostgreSQL host, user and database`);
  const hosted =
    (env["SLOTNOVA_ENV"] !== undefined && isHosted(resolveEnvironment(env))) ||
    env["NODE_ENV"] === "production";
  if (hosted) {
    if (env["NODE_TLS_REJECT_UNAUTHORIZED"] === "0")
      throw new DbConfigError("Hosted connections forbid disabling Node TLS verification");
    if (env["DATABASE_SSL"] !== "require" || !url.password)
      throw new DbConfigError(
        "Hosted database connections require credentials and certificate-verified TLS",
      );
    if ([...url.searchParams.keys()].some((key) => key.toLowerCase().startsWith("ssl")))
      throw new DbConfigError(
        "Configure TLS through DATABASE_SSL and CA trust, not URL SSL overrides",
      );
    if (env["DATABASE_CONNECTION_MODE"] !== "direct")
      throw new DbConfigError(
        "Hosted database connections require explicit DATABASE_CONNECTION_MODE=direct",
      );
    if (["6432", "6543"].includes(url.port) || url.hostname.includes("-pooler"))
      throw new DbConfigError("A pooled endpoint cannot be declared direct");
    if (
      role === "migration" &&
      [env["DATABASE_URL"], env["WORKER_DATABASE_URL"]].some((other) => {
        if (!other) return false;
        try {
          return new URL(other).username === url.username;
        } catch {
          return true;
        }
      })
    )
      throw new DbConfigError("Migration and runtime database principals must differ");
  }
  const poolMax = parseIntEnv(env[DB_ENV.poolMax], DB_ENV.poolMax) ?? DEFAULT_POOL_MAX[role];
  if (poolMax < 1 || poolMax > 100) {
    throw new DbConfigError(`${DB_ENV.poolMax} must be between 1 and 100`);
  }

  return {
    role,
    connectionString,
    ssl: parseSsl(env[DB_ENV.ssl]),
    applicationName: env[DB_ENV.applicationName]?.trim() || `slotnova-${role}`,
    poolMax,
    connectionTimeoutMillis:
      parseIntEnv(env[DB_ENV.connectTimeoutMs], DB_ENV.connectTimeoutMs) ?? 10_000,
    idleTimeoutMillis: parseIntEnv(env[DB_ENV.idleTimeoutMs], DB_ENV.idleTimeoutMs) ?? 10_000,
    statementTimeoutMillis: parseIntEnv(env[DB_ENV.statementTimeoutMs], DB_ENV.statementTimeoutMs),
  };
}
