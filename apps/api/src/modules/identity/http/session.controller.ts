/**
 * `POST /v1/auth/session` (sign-in) / `DELETE /v1/auth/session` (sign-out)
 * (T038, contracts/session.contract.md). CSRF is already enforced for both
 * (any non-safe method) by the global hook registered in `main.ts` -- neither
 * handler re-checks it.
 */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { SecurityConfig } from "../../../config/security-config.js";
import { SECURITY_CONFIG } from "../../../config/security-config.tokens.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { issueCsrfCookie } from "../../platform/security/csrf.js";
import { SignInUseCase } from "../application/session/sign-in.use-case.js";
import {
  clearedSessionCookieAttributes,
  sessionCookieAttributes,
  sessionCookieName,
} from "../application/session/session-cookie.js";
import { SessionService } from "../application/session/session.service.js";
import { parseSignInRequestBody, type SignInResponseBody } from "./session.schema.js";

@Controller("v1/auth/session")
export class SessionController {
  constructor(
    private readonly signInUseCase: SignInUseCase,
    private readonly sessionService: SessionService,
    @Inject(SECURITY_CONFIG) private readonly security: SecurityConfig,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SignInResponseBody> {
    const { credential } = parseSignInRequestBody(body);
    const result = await this.signInUseCase.execute(credential);

    if (result.outcome === "invalid-credentials") {
      throw new ProblemException("invalid-credentials");
    }
    if (result.outcome === "user-disabled") {
      throw new ProblemException("user-disabled");
    }

    reply.setCookie(
      sessionCookieName(this.security.secureCookies),
      result.rawToken,
      sessionCookieAttributes(this.security.secureCookies),
    );
    // CSRF material rotates alongside the session (T037: "rotate CSRF
    // material appropriately with session rotation").
    issueCsrfCookie(reply, {
      allowedOrigins: this.security.corsOrigins,
      secureCookies: this.security.secureCookies,
    });

    return {
      user: result.user,
      activeWorkspace: result.activeWorkspace,
      workspaces: result.workspaces,
    };
  }

  @Delete()
  @HttpCode(204)
  async signOut(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const cookieName = sessionCookieName(this.security.secureCookies);
    const rawToken = request.cookies[cookieName];
    if (rawToken !== undefined) {
      await this.sessionService.revoke(rawToken);
    }
    reply.setCookie(cookieName, "", clearedSessionCookieAttributes(this.security.secureCookies));
  }
}
