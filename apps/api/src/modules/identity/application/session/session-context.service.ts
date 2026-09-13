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

  /**
   * `null` when the session itself is no longer valid and the caller must
   * fail closed with `session-invalid` (contracts/session.contract.md: "A
   * session is invalid once ... the user/workspace/membership becomes
   * inactive"). This covers TWO distinct cases, both review corrections
   * beyond the original disabled-user check:
   *
   *  - the user has been disabled since the session was issued;
   *  - `session.activeWorkspaceId` is non-null but no longer resolves to an
   *    active membership in an active workspace (the membership was
   *    suspended, the workspace was suspended, or the membership was
   *    removed) -- this must NOT silently degrade to `activeWorkspace: null`
   *    with an otherwise-valid context; a session with a selected workspace
   *    that has gone bad is itself invalid, not "valid with no workspace".
   *
   * `session.activeWorkspaceId === null` (no workspace ever selected) stays
   * a legitimately valid context per the same contract.
   */
  async build(session: SessionRecord): Promise<SessionContext | null> {
    const user = await this.users.findById(session.userId);
    if (!user || user.status === "disabled") return null;

    const activeMemberships = await this.memberships.listActiveMembershipsForUser(user.id);
    const workspaces = activeMemberships.map(toWorkspaceSummary);

    if (session.activeWorkspaceId === null) {
      return {
        user: { id: user.id, displayName: user.displayName, email: user.email },
        activeWorkspace: null,
        workspaces,
        sessionExpiresAt: session.expiresAt,
      };
    }

    const activeView = activeMemberships.find(
      (view) => view.workspaceId === session.activeWorkspaceId,
    );
    if (!activeView) return null;

    return {
      user: { id: user.id, displayName: user.displayName, email: user.email },
      activeWorkspace: {
        id: activeView.workspaceId,
        name: activeView.workspaceName,
        role: activeView.role,
        permissions: activeView.permissions,
      },
      workspaces,
      sessionExpiresAt: session.expiresAt,
    };
  }
}
