import type {
  ActiveMembershipView,
  MembershipRole,
} from "../../infrastructure/repositories/memberships.repository.js";
import type { WorkspaceId } from "../../domain/ids.js";

/** `{ id, name, role }` -- the shape both `session.contract.md` and `workspace-context.contract.md` use for every `workspaces[]` entry, and for sign-in's `activeWorkspace`. */
export interface WorkspaceMembershipSummary {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly role: MembershipRole;
}

export function toWorkspaceSummary(view: ActiveMembershipView): WorkspaceMembershipSummary {
  return { id: view.workspaceId, name: view.workspaceName, role: view.role };
}
