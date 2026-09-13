import { Global, Module } from "@nestjs/common";

import { resolveSecurityConfig } from "./security-config.js";
import { SECURITY_CONFIG } from "./security-config.tokens.js";

/**
 * Global so any provider/controller can inject the same resolved
 * {@link import("./security-config.js").SecurityConfig} (CORS allowlist, HSTS,
 * `secureCookies`) that `main.ts` uses to configure Helmet/CORS/cookies --
 * one source of truth, read from `process.env` exactly once per process.
 */
@Global()
@Module({
  providers: [{ provide: SECURITY_CONFIG, useFactory: () => resolveSecurityConfig(process.env) }],
  exports: [SECURITY_CONFIG],
})
export class SecurityConfigModule {}
