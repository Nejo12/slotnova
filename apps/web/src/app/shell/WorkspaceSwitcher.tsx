import { Button, Menu, type MenuItem } from "@slotnova/ui";
import { useCallback } from "react";

import { useSession } from "../auth/use-session.js";
import { useWorkspaceSwitch } from "../auth/use-workspace-switch.js";

/**
 * Workspace switcher (T059). Renders the server's own workspace list
 * (`GET /v1/me`) — no client-side membership validation is duplicated
 * here; the server is the sole authority on which workspaces the user may
 * switch into, and `POST /v1/auth/session/workspace` is the only place
 * that decision is actually made (403 `not-a-member` if it is wrong).
 *
 * `activeWorkspace` is `null` for a multi-membership user who has not yet
 * selected one (contracts/session.contract.md) — this doubles as the
 * initial-selection control in that case, not only a switcher between two
 * already-active workspaces.
 */
export function WorkspaceSwitcher(): React.JSX.Element | null {
  const { activeWorkspace, me } = useSession();
  const workspaceSwitch = useWorkspaceSwitch();

  const handleSelect = useCallback(
    (workspaceId: string) => {
      if (workspaceId === activeWorkspace?.id) return;
      workspaceSwitch.mutate(workspaceId);
    },
    [activeWorkspace?.id, workspaceSwitch],
  );

  if (!me) return null;

  const items: MenuItem[] = me.workspaces.map((workspace) => ({
    id: workspace.id,
    label: workspace.name,
    onSelect: () => handleSelect(workspace.id),
    disabled: workspace.id === activeWorkspace?.id || workspaceSwitch.isPending,
  }));

  const triggerLabel = activeWorkspace?.name ?? "Select a workspace";

  return (
    <Menu
      trigger={
        <Button
          type="button"
          variant="secondary"
          aria-label={`Workspace switcher, current workspace ${triggerLabel}`}
        >
          {triggerLabel}
        </Button>
      }
      items={items}
    />
  );
}
