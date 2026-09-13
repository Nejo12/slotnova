/**
 * Nest HTTP-boundary enforcement for `authorize()` (T041, ADR-009). Resolves
 * the authenticated session the exact same fail-closed way `MeController`
 * does (never from client input) and rejects with `problem+json` before a
 * handler body ever runs. A route with no `@RequireCapability` metadata is
 * not gated by this guard (opt-in, per route).
 *
 * `session-invalid` vs `forbidden`: a session/membership/workspace that has
 * gone bad reuses PR-08's existing fail-closed `session-invalid` semantics
 * (`SessionContextService.build` already returns `null` for a suspended
 * membership/workspace -- there is no separate "authorized but suspended"
 * state to invent). `forbidden` is reserved for an otherwise-valid, active
 * context that simply lacks the required capability, or has no active
 * workspace selected at all.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import type { SecurityConfig } from "../../../../config/security-config.js";
import { SECURITY_CONFIG } from "../../../../config/security-config.tokens.js";
import { ProblemException } from "../../../../http/problem/problem.exception.js";
import { sessionCookieName } from "../../application/session/session-cookie.js";
import { SessionContextService } from "../../application/session/session-context.service.js";
import { SessionService } from "../../application/session/session.service.js";
import { authorize } from "./authorize.js";
import { REQUIRE_CAPABILITY_KEY } from "./require-capability.decorator.js";

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly sessionContextService: SessionContextService,
    @Inject(SECURITY_CONFIG) private readonly security: SecurityConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredCapability = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredCapability === undefined) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const rawToken = request.cookies[sessionCookieName(this.security.secureCookies)];
    const session = rawToken === undefined ? null : await this.sessionService.validate(rawToken);
    if (!session) throw new ProblemException("session-invalid");

    const sessionContext = await this.sessionContextService.build(session);
    if (!sessionContext) throw new ProblemException("session-invalid");

    if (!sessionContext.activeWorkspace) {
      throw new ProblemException("forbidden", { requiredCapability });
    }

    const authorized = authorize(
      { membershipStatus: "active", workspaceStatus: "active", permissions: sessionContext.activeWorkspace.permissions },
      requiredCapability,
    );
    if (!authorized) {
      throw new ProblemException("forbidden", { requiredCapability });
    }
    return true;
  }
}
