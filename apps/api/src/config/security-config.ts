/**
 * Minimal, local-to-`apps/api` security configuration: the strict CORS
 * allowlist and HSTS toggle (T019, `docs/security/security-and-audit.md`).
 * Composed by the T072 environment boundary; this module reads security values with no implicit
 * permissive fallback (an unset allowlist means "allow no origins", not "*").
 */

export class SecurityConfigError extends Error {
  override name = "SecurityConfigError";
}

/**
 * `scheme://host[:port]` only -- no path, no query, no trailing slash, no
 * wildcard. A browser's `Origin` header is always exactly this shape, so
 * anything else in the allowlist could never legitimately match a real
 * request and is rejected as misconfiguration rather than silently ignored.
 */
const ORIGIN_PATTERN = /^https?:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::\d{1,5})?$/;

/**
 * Review correction (CORS hardening): `credentials: true` is only safe
 * alongside an explicit, non-wildcard origin allowlist (T037/T038 — the
 * session/CSRF cookies now require `credentials: true` for the cross-origin
 * SPA case). This makes "no wildcard" an executable invariant of config
 * parsing itself, rather than trusting every future caller of
 * `corsOrigins`/`enableCors` to remember it.
 */
function assertValidOrigin(origin: string): void {
  if (origin === "*") {
    throw new SecurityConfigError(
      `${SECURITY_ENV.corsOrigins} must not contain a wildcard "*" origin — list explicit origins only (credentials:true is never safe with a wildcard).`,
    );
  }
  if (!ORIGIN_PATTERN.test(origin)) {
    throw new SecurityConfigError(
      `${SECURITY_ENV.corsOrigins} contains a value that is not a valid "scheme://host[:port]" origin: ${JSON.stringify(origin)}`,
    );
  }
}

export interface SecurityConfig {
  /** Explicit CORS origin allowlist. Empty means no cross-origin request is allowed. */
  readonly corsOrigins: readonly string[];
  /** Whether to send Strict-Transport-Security. Default on; harmless over plain HTTP (browsers ignore it there). */
  readonly enableHsts: boolean;
  /**
   * Whether session/CSRF cookies carry `Secure` and use the `__Host-` prefix
   * (ADR-007). Default on -- an explicit opt-out is required for local dev
   * over plain `http://localhost`, where `Secure`/`__Host-` cookies would
   * otherwise be silently rejected by the browser (T037).
   */
  readonly secureCookies: boolean;
}

export const SECURITY_ENV = {
  corsOrigins: "API_CORS_ALLOWED_ORIGINS",
  enableHsts: "API_ENABLE_HSTS",
  secureCookies: "API_SECURE_COOKIES",
} as const;

export function resolveSecurityConfig(env: NodeJS.ProcessEnv = process.env): SecurityConfig {
  const rawOrigins = env[SECURITY_ENV.corsOrigins]?.trim() ?? "";
  const corsOrigins =
    rawOrigins === ""
      ? []
      : rawOrigins
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin !== "");
  corsOrigins.forEach(assertValidOrigin);

  const rawHsts = env[SECURITY_ENV.enableHsts]?.trim().toLowerCase();
  if (rawHsts !== undefined && !["true", "false"].includes(rawHsts))
    throw new SecurityConfigError("API_ENABLE_HSTS must be true or false");
  const enableHsts = rawHsts !== "false";

  const rawSecureCookies = env[SECURITY_ENV.secureCookies]?.trim().toLowerCase();
  if (rawSecureCookies !== undefined && !["true", "false"].includes(rawSecureCookies))
    throw new SecurityConfigError("API_SECURE_COOKIES must be true or false");
  const secureCookies = rawSecureCookies !== "false";

  return { corsOrigins, enableHsts, secureCookies };
}
