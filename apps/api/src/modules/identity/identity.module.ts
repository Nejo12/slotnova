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
    {
      provide: CREDENTIAL_ADAPTER,
      useFactory: () => {
        if (process.env["API_CREDENTIAL_ADAPTER"] === "disabled")
          return { verify: async () => null };
        if (
          ["staging", "production"].includes(process.env["SLOTNOVA_ENV"] ?? "") ||
          process.env["NODE_ENV"] === "production"
        )
          throw new Error("Development credential adapter is forbidden in hosted environments");
        return new DevCredentialAdapter(DEFAULT_SEEDED_USERS);
      },
    },
  ],
  /**
   * `CapabilityGuard` is exported so another module's controllers can gate
   * their routes with the same server-authoritative guard (Phase-2 PR-02's
   * Catalog endpoints) instead of re-implementing authorization locally.
   *
   * `SessionService`/`SessionContextService` are exported ONLY because Nest
   * constructs a referenced guard inside the *consuming* module's injector,
   * so the guard's own constructor dependencies must be resolvable there —
   * without them, importing this module and using `@UseGuards(CapabilityGuard)`
   * fails at boot with `UndefinedDependencyException`. They are not an
   * invitation for another module to use identity's session machinery
   * directly: `module-public-entry-only`
   * (`tooling/dependency-cruiser/.dependency-cruiser.cjs`) still forbids
   * importing `identity/application/**`, so no other module can even name
   * these classes.
   */
  exports: [CapabilityGuard, SessionService, SessionContextService],
})
export class IdentityModule {}
