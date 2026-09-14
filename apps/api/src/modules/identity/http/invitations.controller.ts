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
import { ApiBody, ApiParam } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { SecurityConfig } from "../../../config/security-config.js";
import { SECURITY_CONFIG } from "../../../config/security-config.tokens.js";
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
import { InvitationPreviewRateLimiter } from "./invitation-preview-rate-limiter.js";
import {
  invitationIdParamSchema,
  IssueInvitationRequestDto,
  IssueInvitationResponseDto,
  InvitationPreviewResponseDto,
  RevokeInvitationRequestDto,
  type IssueInvitationRequestBody,
} from "./invitations.schema.js";
import { MeResponseDto, type MeResponseBody } from "./me.schema.js";
import { ZodValidationPipe } from "./zod-validation.js";

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
    private readonly previewRateLimiter: InvitationPreviewRateLimiter,
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
      ...(process.env["NODE_ENV"] === "production" ? {} : { token: result.rawToken }),
    };
  }

  @Get(":token")
  @ApiParam({ name: "token", type: "string" })
  @ZodResponse({ status: 200, type: InvitationPreviewResponseDto })
  async preview(@Param("token") token: string, @Req() request: FastifyRequest) {
    this.previewRateLimiter.check(token, request.ip);
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
