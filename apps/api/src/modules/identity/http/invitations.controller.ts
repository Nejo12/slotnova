import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBody, ApiParam, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { SecurityConfig } from "../../../config/security-config.js";
import { SECURITY_CONFIG } from "../../../config/security-config.tokens.js";
import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { issueCsrfCookie } from "../../platform/security/csrf.js";
import { AcceptInvitationUseCase } from "../application/invitation/accept.js";
import { IssueInvitationUseCase } from "../application/invitation/issue.js";
import { PreviewInvitationUseCase } from "../application/invitation/preview.js";
import { RevokeInvitationUseCase } from "../application/invitation/revoke.js";
import {
  sessionCookieAttributes,
  sessionCookieName,
} from "../application/session/session-cookie.js";
import { SessionContextService } from "../application/session/session-context.service.js";
import { SessionService } from "../application/session/session.service.js";
import { asInvitationId } from "../domain/ids.js";
import { CapabilityGuard } from "../domain/policy/capability.guard.js";
import { MEMBERS_INVITE } from "../domain/policy/capabilities.js";
import { RequireCapability } from "../domain/policy/require-capability.decorator.js";
import { MembershipsRepository } from "../infrastructure/repositories/memberships.repository.js";
import {
  invitationIdParamSchema,
  IssueInvitationRequestDto,
  IssueInvitationResponseDto,
  InvitationPreviewResponseDto,
  RevokeInvitationRequestDto,
  type IssueInvitationRequestBody,
} from "./invitations.schema.js";
import { MeResponseDto, type MeResponseBody } from "./me.schema.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";

const PROBLEM_JSON_CONTENT = {
  "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
};

/**
 * `issue`/`accept`/`revoke` are state-changing (CSRF required, enforced by
 * the same global Fastify hook as `SessionController`/
 * `WorkspaceContextController` -- not documented per-route here for the same
 * reason: it is not visible to `@nestjs/swagger`'s controller-method
 * introspection. `preview` is read-only/token-authenticated and has no CSRF
 * requirement.
 */
@Controller("v1/invitations")
export class InvitationsController {
  constructor(
    private readonly issueUseCase: IssueInvitationUseCase,
    private readonly previewUseCase: PreviewInvitationUseCase,
    private readonly acceptUseCase: AcceptInvitationUseCase,
    private readonly revokeUseCase: RevokeInvitationUseCase,
    private readonly sessionService: SessionService,
    private readonly sessionContextService: SessionContextService,
    private readonly memberships: MembershipsRepository,
    @Inject(SECURITY_CONFIG) private readonly security: SecurityConfig,
  ) {}

  private async authenticated(request: FastifyRequest) {
    const cookieName = sessionCookieName(this.security.secureCookies);
    const rawToken = request.cookies[cookieName];
    const session = rawToken ? await this.sessionService.validate(rawToken) : null;
    if (!session) throw new ProblemException("session-invalid");
    const context = await this.sessionContextService.build(session);
    if (!context) throw new ProblemException("session-invalid");
    return { cookieName, rawToken: rawToken as string, session, context };
  }

  @Post()
  @UseGuards(CapabilityGuard)
  @RequireCapability(MEMBERS_INVITE)
  @UsePipes(new ZodValidationPipe(IssueInvitationRequestDto))
  @ApiBody({ type: IssueInvitationRequestDto })
  @ZodResponse({ status: 201, type: IssueInvitationResponseDto })
  @ApiResponse({
    status: 400,
    description: "Bad email/role, or `role: owner` (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `members:invite`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 409,
    description:
      "A pending invitation already exists for that email (`invitation-exists`), or the email already maps to an active membership (`already-member`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async issue(@Body() body: IssueInvitationRequestBody, @Req() request: FastifyRequest) {
    const auth = await this.authenticated(request);
    const active = auth.context.activeWorkspace;
    if (!active) {
      throw new ProblemException("forbidden", { requiredCapability: MEMBERS_INVITE });
    }
    const membership = await this.memberships.findOwnMembershipInWorkspace(
      auth.session.userId,
      active.id,
    );
    if (!membership) throw new ProblemException("session-invalid");

    const result = await this.issueUseCase.execute({
      workspaceId: active.id,
      actorUserId: auth.session.userId,
      invitedBy: membership.membershipId,
      ...body,
    });
    return {
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt.toISOString(),
      },
      ...(["staging", "production"].includes(process.env["SLOTNOVA_ENV"] ?? "") ||
      process.env["NODE_ENV"] === "production"
        ? {}
        : { token: result.rawToken }),
    };
  }

  @Get(":token")
  @ApiParam({ name: "token", type: "string" })
  @ZodResponse({ status: 200, type: InvitationPreviewResponseDto })
  @ApiResponse({
    status: 404,
    description: "Unknown/garbage/revoked token (`invitation-not-found`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 410,
    description: "Expired or already-used token (`invitation-expired`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests for this token/IP (`rate-limited`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async preview(@Param("token") token: string) {
    const invitation = await this.previewUseCase.execute(token);
    return {
      workspaceName: invitation.workspaceName,
      role: invitation.role,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  @Post(":token/acceptance")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "token", type: "string" })
  @ZodResponse({ status: 200, type: MeResponseDto })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Signed-in user's email does not match the invitation (`email-mismatch`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 409,
    description: "User is already a member (`already-member`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 410,
    description: "Expired, already-used, or revoked token (`invitation-expired`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async accept(
    @Param("token") token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponseBody> {
    const auth = await this.authenticated(request);
    const invitation = await this.acceptUseCase.execute({
      rawToken: token,
      userId: auth.session.userId,
      userEmail: auth.context.user.email,
    });
    const rotated = await this.sessionService.rotate(auth.rawToken, {
      activeWorkspaceId: invitation.workspaceId,
    });
    if (!rotated) throw new ProblemException("session-invalid");
    const context = await this.sessionContextService.build(rotated.session);
    if (!context) throw new ProblemException("session-invalid");

    reply.setCookie(
      auth.cookieName,
      rotated.rawToken,
      sessionCookieAttributes(this.security.secureCookies),
    );
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

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CapabilityGuard)
  @RequireCapability(MEMBERS_INVITE)
  @ApiParam({ name: "id", type: "string" })
  @ApiBody({ type: RevokeInvitationRequestDto })
  @ApiResponse({
    status: 400,
    description: "Malformed id/body (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `members:invite`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 404,
    description: "No pending invitation with that id in the active workspace (`not-found`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async revoke(
    @Param("id", new ZodValidationPipe(invitationIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(RevokeInvitationRequestDto)) _body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const invitationId = asInvitationId(id);
    const auth = await this.authenticated(request);
    const active = auth.context.activeWorkspace;
    if (!active) {
      throw new ProblemException("forbidden", { requiredCapability: MEMBERS_INVITE });
    }
    await this.revokeUseCase.execute({
      workspaceId: active.id,
      actorUserId: auth.session.userId,
      invitationId,
    });
  }
}
