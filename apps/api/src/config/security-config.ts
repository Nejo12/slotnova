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
}

export const SECURITY_ENV = {
  corsOrigins: "API_CORS_ALLOWED_ORIGINS",
  enableHsts: "API_ENABLE_HSTS",
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

  return { corsOrigins, enableHsts };
}
