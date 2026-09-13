import { Module } from "@nestjs/common";

import { DEFAULT_SEEDED_USERS } from "./infrastructure/credential-adapter/default-seeded-users.js";
import { CREDENTIAL_ADAPTER } from "./infrastructure/credential-adapter/credential-adapter.tokens.js";
import { DevCredentialAdapter } from "./infrastructure/credential-adapter/dev-adapter.js";
import { MembershipsRepository } from "./infrastructure/repositories/memberships.repository.js";
import { SessionsRepository } from "./infrastructure/repositories/sessions.repository.js";
import { UsersRepository } from "./infrastructure/repositories/users.repository.js";
import { SessionContextService } from "./application/session/session-context.service.js";
import { SessionService } from "./application/session/session.service.js";
import { SignInUseCase } from "./application/session/sign-in.use-case.js";
import { MeController } from "./http/me.controller.js";
import { SessionController } from "./http/session.controller.js";

/**
 * `identity` module HTTP + application wiring (T034-T038). Phase 1 wires
 * only the development credential adapter (R5: a production provider is
 * deferred/conditional) -- everything downstream depends on the
 * `CREDENTIAL_ADAPTER` port, not on `DevCredentialAdapter` directly.
 */
@Module({
  controllers: [SessionController, MeController],
  providers: [
    UsersRepository,
    SessionsRepository,
    MembershipsRepository,
    SessionService,
    SessionContextService,
    SignInUseCase,
    { provide: CREDENTIAL_ADAPTER, useValue: new DevCredentialAdapter(DEFAULT_SEEDED_USERS) },
  ],
})
export class IdentityModule {}
