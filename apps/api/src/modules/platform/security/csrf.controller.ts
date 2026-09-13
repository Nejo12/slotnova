import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { SECURITY_CONFIG } from "../../../config/security-config.tokens.js";
import type { SecurityConfig } from "../../../config/security-config.js";
import { issueCsrfCookie } from "./csrf.js";

export interface CsrfBootstrapResponse {
  readonly csrfToken: string;
}

/**
 * `GET /v1/auth/csrf` -- the safe pre-session CSRF bootstrap route (T037,
 * research R6: "the SPA obtains a pre-session CSRF token from a safe
 * bootstrap route"). Safe/side-effect-free at the server-state level (it
 * mutates nothing persisted -- only sets a per-response cookie nonce), so it
 * stays exempt from CSRF verification itself (`GET` is a safe method).
 */
@Controller()
export class CsrfController {
  constructor(@Inject(SECURITY_CONFIG) private readonly security: SecurityConfig) {}

  @Get("v1/auth/csrf")
  bootstrap(@Res({ passthrough: true }) reply: FastifyReply): CsrfBootstrapResponse {
    const csrfToken = issueCsrfCookie(reply, {
      allowedOrigins: this.security.corsOrigins,
      secureCookies: this.security.secureCookies,
    });
    return { csrfToken };
  }
}
