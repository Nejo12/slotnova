/**
 * Minimal, local-to-`apps/api` security configuration: the strict CORS
 * allowlist and HSTS toggle (T019, `docs/security/security-and-audit.md`).
 * The full four-class environment/config model is a later task (T072) — this
 * reads only the handful of env vars this bootstrap needs, with no implicit
 * permissive fallback (an unset allowlist means "allow no origins", not "*").
 */

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

  const rawHsts = env[SECURITY_ENV.enableHsts]?.trim().toLowerCase();
  const enableHsts = rawHsts !== "false";

  const rawSecureCookies = env[SECURITY_ENV.secureCookies]?.trim().toLowerCase();
  const secureCookies = rawSecureCookies !== "false";

  return { corsOrigins, enableHsts, secureCookies };
}
