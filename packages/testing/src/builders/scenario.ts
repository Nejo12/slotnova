import { buildInvitation, type InvitationShape } from "./invitation.js";
import { buildMembership, type MembershipShape } from "./membership.js";
import { buildSession, type SessionShape } from "./session.js";
import { buildUser, type UserShape } from "./user.js";
import { buildWorkspace, type WorkspaceShape } from "./workspace.js";
import { applyOverride, type Override } from "./override.js";

export interface WorkspaceScenario {
  readonly workspace: WorkspaceShape;
  readonly owner: UserShape;
  readonly membership: MembershipShape;
  readonly session: SessionShape;
  readonly invitation: InvitationShape;
}

export interface WorkspaceScenarioOverrides {
  readonly workspace?: Override<WorkspaceShape>;
  readonly owner?: Override<UserShape>;
  readonly membership?: Override<MembershipShape>;
  readonly session?: Override<SessionShape>;
  readonly invitation?: Override<InvitationShape>;
}

/**
 * Compose the five builders into one internally-consistent graph: an owner who
 * is a member of a workspace, holds a session scoped to it, and has invited
 * someone else to it. Relationship fields (`workspaceId`, `userId`,
 * `invitedByUserId`, `activeWorkspaceId`) are wired from the built entities:
 * a caller override is applied first, then the link is re-established.
 */
export function buildWorkspaceScenario(
  overrides: WorkspaceScenarioOverrides = {},
): WorkspaceScenario {
  const workspace = buildWorkspace(overrides.workspace);
  const owner = buildUser(overrides.owner);

  const membership = buildMembership((defaults) => ({
    ...applyOverride(defaults, overrides.membership),
    workspaceId: workspace.id,
    userId: owner.id,
    role: "owner",
  }));

  const session = buildSession((defaults) => ({
    ...applyOverride(defaults, overrides.session),
    userId: owner.id,
    activeWorkspaceId: workspace.id,
  }));

  const invitation = buildInvitation((defaults) => ({
    ...applyOverride(defaults, overrides.invitation),
    workspaceId: workspace.id,
    invitedByUserId: owner.id,
  }));

  return { workspace, owner, membership, session, invitation };
}
