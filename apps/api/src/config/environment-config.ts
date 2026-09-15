import { isIP } from "node:net";
import { z } from "zod";
import { isHosted, resolveEnvironment, type Environment } from "@slotnova/deployment-config";
import { resolveDbConfig } from "@slotnova/db";
import { resolveSecurityConfig } from "./security-config.js";

const apiSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_TRUST_PROXY: z.string().default(""),
  API_CREDENTIAL_ADAPTER: z.enum(["development", "disabled"]).default("development"),
  API_RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).max(1000).default(20),
  API_RATE_LIMIT_PREVIEW_MAX: z.coerce.number().int().min(1).max(1000).default(20),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  API_RATE_LIMIT_MAX_KEYS: z.coerce.number().int().min(1).max(100000).default(10000),
});

export function resolveApiConfig(env: Environment = process.env) {
  const environment = resolveEnvironment(env);
  const parsed = apiSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid API configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const value = parsed.data;
  const security = resolveSecurityConfig(env);
  const hosted = isHosted(environment);
  if (hosted || env["NODE_ENV"] === "production") {
    if (value.API_CREDENTIAL_ADAPTER === "development")
      throw new Error(
        "Development credentials are forbidden outside local/preview; configure the disabled adapter until R5 integration",
      );
    if (!security.secureCookies || !security.enableHsts)
      throw new Error("Hosted API requires secure cookies and HSTS");
    if (
      !security.corsOrigins.length ||
      security.corsOrigins.some((origin) => !origin.startsWith("https://"))
    )
      throw new Error("Hosted API requires an explicit HTTPS origin allowlist");
    if (
      env["SCHEDULER_MIGRATION_URL"] ||
      env["DATABASE_MIGRATION_URL"] ||
      env["WORKER_DATABASE_URL"]
    )
      throw new Error("API runtime must not receive migration or worker credentials");
  }
  const trustProxy = value.API_TRUST_PROXY.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // No blanket trust or hop counts: trust only literal proxy addresses/subnets.
  if (
    trustProxy.some((entry) => {
      const [address, mask, extra] = entry.split("/");
      const family = isIP(address ?? "");
      return (
        !family ||
        extra !== undefined ||
        (mask !== undefined &&
          (!/^\d+$/.test(mask) || Number(mask) < 1 || Number(mask) > (family === 4 ? 32 : 128)))
      );
    })
  )
    throw new Error("API_TRUST_PROXY must contain explicit proxy IPs/CIDRs, never blanket trust");
  return { environment, ...value, trustProxy, security, db: resolveDbConfig("app", env) };
}
