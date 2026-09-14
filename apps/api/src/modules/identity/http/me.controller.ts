/**
 * `GET /v1/me` (T038, contracts/workspace-context.contract.md). Read-only, no
 * CSRF requirement (safe method).
 */
import { Controller, Get, Inject, Req } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import type { FastifyRequest } from "fastify";

import type { SecurityConfig } from "../../../config/security-config.js";
import { SECURITY_CONFIG } from "../../../config/security-config.tokens.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { sessionCookieName } from "../application/session/session-cookie.js";
import { SessionContextService } from "../application/session/session-context.service.js";
import { SessionService } from "../application/session/session.service.js";
import { MeResponseDto, type MeResponseBody } from "./me.schema.js";

@Controller("v1")
export class MeController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionContextService: SessionContextService,
    @Inject(SECURITY_CONFIG) private readonly security: SecurityConfig,
  ) {}

  @Get("me")
  @ZodResponse({ status: 200, type: MeResponseDto })
  async me(@Req() request: FastifyRequest): Promise<MeResponseBody> {
    const rawToken = request.cookies[sessionCookieName(this.security.secureCookies)];
    const session = rawToken === undefined ? null : await this.sessionService.validate(rawToken);
    if (!session) {
      throw new ProblemException("session-invalid");
    }

    const context = await this.sessionContextService.build(session);
    if (!context) {
      throw new ProblemException("session-invalid");
    }

    return {
      user: context.user,
      activeWorkspace: context.activeWorkspace,
      workspaces: context.workspaces,
      session: { expiresAt: context.sessionExpiresAt.toISOString() },
    };
  }
}
