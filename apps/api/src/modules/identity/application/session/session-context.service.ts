/**
 * Builds the `GET /v1/me` response shape (T038,
 * contracts/workspace-context.contract.md) from an already-validated
 * session. `activeWorkspace.permissions` reads straight off the membership
 * row (data-model.md "Membership.permissions ... server-side authorization
 * reads this") -- no authorization-policy engine (T041) is needed for this
 * read-only projection.
 */
import { Injectable } from "@nestjs/common";

import type { UserId } from "../../domain/ids.js";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository.js";
import type { SessionRecord } from "../../infrastructure/repositories/sessions.repository.js";
import { UsersRepository } from "../../infrastructure/repositories/users.repository.js";
import { toWorkspaceSummary, type WorkspaceMembershipSummary } from "./workspace-summary.js";

export interface ActiveWorkspaceContext extends WorkspaceMembershipSummary {
  readonly permissions: readonly string[];
}

export interface SessionContext {
  readonly user: { readonly id: UserId; readonly displayName: string; readonly email: string };
  readonly activeWorkspace: ActiveWorkspaceContext | null;
  readonly workspaces: readonly WorkspaceMembershipSummary[];
  readonly sessionExpiresAt: Date;
}

@Injectable()
export class SessionContextService {
  constructor(
    private readonly users: UsersRepository,
    private readonly memberships: MembershipsRepository,
  ) {}

  /** `null` when the session's own user no longer resolves to a usable identity (disabled since sign-in) -- callers fail closed with `session-invalid`. */
  async build(session: SessionRecord): Promise<SessionContext | null> {
    const user = await this.users.findById(session.userId);
    if (!user || user.status === "disabled") return null;

    const activeMemberships = await this.memberships.listActiveMembershipsForUser(user.id);
    const workspaces = activeMemberships.map(toWorkspaceSummary);
    const activeView = session.activeWorkspaceId
      ? activeMemberships.find((view) => view.workspaceId === session.activeWorkspaceId)
      : undefined;

    return {
      user: { id: user.id, displayName: user.displayName, email: user.email },
      activeWorkspace: activeView
        ? {
            id: activeView.workspaceId,
            name: activeView.workspaceName,
            role: activeView.role,
            permissions: activeView.permissions,
          }
        : null,
      workspaces,
      sessionExpiresAt: session.expiresAt,
    };
  }
}
