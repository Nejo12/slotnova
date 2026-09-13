/**
 * `POST /v1/auth/session` orchestration (T038, contracts/session.contract.md)
 * -- kept out of the controller so it is directly unit/integration-testable
 * without HTTP, and so T039's parity test can call it once per adapter.
 */
import { Inject, Injectable } from "@nestjs/common";

import type { UserId } from "../../domain/ids.js";
import type { CredentialAdapter } from "../../infrastructure/credential-adapter/port.js";
import { CREDENTIAL_ADAPTER } from "../../infrastructure/credential-adapter/credential-adapter.tokens.js";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository.js";
import { UsersRepository } from "../../infrastructure/repositories/users.repository.js";
import { resolveVerifiedUser } from "./resolve-verified-user.js";
import { SessionService } from "./session.service.js";
import { toWorkspaceSummary, type WorkspaceMembershipSummary } from "./workspace-summary.js";

export interface SignedInResult {
  readonly outcome: "signed-in";
  readonly rawToken: string;
  readonly user: { readonly id: UserId; readonly displayName: string; readonly email: string };
  readonly activeWorkspace: WorkspaceMembershipSummary | null;
  readonly workspaces: readonly WorkspaceMembershipSummary[];
}

export type SignInOutcome =
  | SignedInResult
  | { readonly outcome: "invalid-credentials" }
  | { readonly outcome: "user-disabled" };

@Injectable()
export class SignInUseCase {
  constructor(
    @Inject(CREDENTIAL_ADAPTER) private readonly credentialAdapter: CredentialAdapter,
    private readonly users: UsersRepository,
    private readonly memberships: MembershipsRepository,
    private readonly sessionService: SessionService,
  ) {}

  async execute(
    credential: unknown,
    clientHint: Readonly<Record<string, unknown>> = {},
  ): Promise<SignInOutcome> {
    const verified = await this.credentialAdapter.verify(credential);
    if (!verified) return { outcome: "invalid-credentials" };

    const user = await resolveVerifiedUser(this.users, verified);
    if (!user) return { outcome: "invalid-credentials" };
    if (user.status === "disabled") return { outcome: "user-disabled" };

    const activeMemberships = await this.memberships.listActiveMembershipsForUser(user.id);
    const workspaces = activeMemberships.map(toWorkspaceSummary);
    const activeWorkspace =
      workspaces.length === 1 ? (workspaces[0] as WorkspaceMembershipSummary) : null;

    const { rawToken } = await this.sessionService.issue({
      userId: user.id,
      activeWorkspaceId: activeWorkspace?.id ?? null,
      clientHint,
    });

    return {
      outcome: "signed-in",
      rawToken,
      user: { id: user.id, displayName: user.displayName, email: user.email },
      activeWorkspace,
      workspaces,
    };
  }
}
