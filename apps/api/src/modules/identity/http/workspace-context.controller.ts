/**
 * `POST /v1/auth/session/workspace` (T042, contracts/workspace-context.contract.md).
 * CSRF is already enforced for this state-changing POST by the global hook
 * registered in `main.ts` (same as `SessionController`) -- this handler does
 * not re-check it, only rotates the CSRF cookie alongside the session, same
 * as sign-in.
 *
 * CSRF-missing/-mismatch (403 `forbidden`) is not documented via a per-route
 * `@ApiResponse` here for the same reason as `SessionController` -- it comes
 * from a Fastify-level hook outside Nest's/`@nestjs/swagger`'s introspection
 * (see that controller's file comment for the full explanation).
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UsePipes,
} from "@nestjs/common";
import { ApiBody, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { SecurityConfig } from "../../../config/security-config.js";
import { SECURITY_CONFIG } from "../../../config/security-config.tokens.js";
import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { issueCsrfCookie } from "../../platform/security/csrf.js";
import {
  sessionCookieAttributes,
  sessionCookieName,
} from "../application/session/session-cookie.js";
import { SessionContextService } from "../application/session/session-context.service.js";
import { SessionService } from "../application/session/session.service.js";
import { asWorkspaceId } from "../domain/ids.js";
import { MembershipsRepository } from "../infrastructure/repositories/memberships.repository.js";
import { MeResponseDto, type MeResponseBody } from "./me.schema.js";
import {
  WorkspaceSwitchRequestDto,
  type WorkspaceSwitchRequestBody,
} from "./workspace-context.schema.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";

const PROBLEM_JSON_CONTENT = {
  "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
};

@Controller("v1/auth/session")
export class WorkspaceContextController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionContextService: SessionContextService,
    private readonly memberships: MembershipsRepository,
    @Inject(SECURITY_CONFIG) private readonly security: SecurityConfig,
  ) {}

  @Post("workspace")
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(WorkspaceSwitchRequestDto))
  @ApiBody({ type: WorkspaceSwitchRequestDto })
  @ZodResponse({ status: 200, type: MeResponseDto })
  @ApiResponse({
    status: 400,
    description: "Malformed body (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "No active membership in the target workspace (`not-a-member`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 409,
    description: "Target workspace or membership is suspended (`workspace-unavailable`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async switchWorkspace(
    @Body() body: WorkspaceSwitchRequestBody,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponseBody> {
    const { workspaceId } = body;

    const cookieName = sessionCookieName(this.security.secureCookies);
    const rawToken = request.cookies[cookieName];
    const session = rawToken === undefined ? null : await this.sessionService.validate(rawToken);
    if (!session) {
      throw new ProblemException("session-invalid");
    }

    const target = await this.memberships.findOwnMembershipInWorkspace(
      session.userId,
      asWorkspaceId(workspaceId),
    );
    if (!target) {
      // No membership row at all -- an unknown workspace and a workspace
      // belonging to someone else look identical here by construction
      // (contracts/workspace-context.contract.md: no existence disclosure).
      throw new ProblemException("not-a-member");
    }
    if (target.membershipStatus === "suspended" || target.workspaceStatus === "suspended") {
      throw new ProblemException("workspace-unavailable");
    }

    const rotated = await this.sessionService.rotate(rawToken as string, {
      activeWorkspaceId: target.workspaceId,
    });
    if (!rotated) {
      // The presented token stopped being valid between validate() and
      // rotate() (e.g. concurrent sign-out) -- fail closed, same as /me.
      throw new ProblemException("session-invalid");
    }

    const context = await this.sessionContextService.build(rotated.session);
    if (!context) {
      throw new ProblemException("session-invalid");
    }

    reply.setCookie(
      cookieName,
      rotated.rawToken,
      sessionCookieAttributes(this.security.secureCookies),
    );
    // CSRF material rotates alongside the session, same as sign-in (T037).
    issueCsrfCookie(reply, {
      allowedOrigins: this.security.corsOrigins,
      secureCookies: this.security.secureCookies,
    });

    return {
      user: context.user,
      activeWorkspace: context.activeWorkspace,
      workspaces: context.workspaces,
      session: { expiresAt: context.sessionExpiresAt.toISOString() },
    };
  }
}
