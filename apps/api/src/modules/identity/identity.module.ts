import { Module } from "@nestjs/common";

import { TenancyModule } from "../platform/tenancy/tenancy.module.js";

import { DEFAULT_SEEDED_USERS } from "./infrastructure/credential-adapter/default-seeded-users.js";
import { CREDENTIAL_ADAPTER } from "./infrastructure/credential-adapter/credential-adapter.tokens.js";
import { DevCredentialAdapter } from "./infrastructure/credential-adapter/dev-adapter.js";
import { MembershipsRepository } from "./infrastructure/repositories/memberships.repository.js";
import { SessionsRepository } from "./infrastructure/repositories/sessions.repository.js";
import { UsersRepository } from "./infrastructure/repositories/users.repository.js";
import { SessionContextService } from "./application/session/session-context.service.js";
import { SessionService } from "./application/session/session.service.js";
import { SignInUseCase } from "./application/session/sign-in.use-case.js";
import { CapabilityGuard } from "./domain/policy/capability.guard.js";
import { MeController } from "./http/me.controller.js";
import { SessionController } from "./http/session.controller.js";
import { WorkspaceContextController } from "./http/workspace-context.controller.js";
import { AcceptInvitationUseCase } from "./application/invitation/accept.js";
import { IssueInvitationUseCase } from "./application/invitation/issue.js";
import { PreviewInvitationUseCase } from "./application/invitation/preview.js";
import { RevokeInvitationUseCase } from "./application/invitation/revoke.js";
import { InvitationsController } from "./http/invitations.controller.js";
import { InvitationPreviewRateLimiter } from "./http/invitation-preview-rate-limiter.js";
import {
  InvitationsRepository,
  InvitationTransactions,
} from "./infrastructure/repositories/invitations.repository.js";

/**
 * `identity` module HTTP + application wiring (T034-T038). Phase 1 wires
 * only the development credential adapter (R5: a production provider is
 * deferred/conditional) -- everything downstream depends on the
 * `CREDENTIAL_ADAPTER` port, not on `DevCredentialAdapter` directly.
 */
@Module({
  imports: [TenancyModule],
  controllers: [SessionController, MeController, WorkspaceContextController, InvitationsController],
  providers: [
    UsersRepository,
    SessionsRepository,
    MembershipsRepository,
    SessionService,
    SessionContextService,
    SignInUseCase,
    CapabilityGuard,
    InvitationsRepository,
    InvitationTransactions,
    IssueInvitationUseCase,
    PreviewInvitationUseCase,
    AcceptInvitationUseCase,
    RevokeInvitationUseCase,
    InvitationPreviewRateLimiter,
    { provide: CREDENTIAL_ADAPTER, useValue: new DevCredentialAdapter(DEFAULT_SEEDED_USERS) },
  ],
})
export class IdentityModule {}
