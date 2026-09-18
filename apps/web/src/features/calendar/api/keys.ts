/**
 * Calendar query keys. Every key is built with the shell's `wsKey` factory,
 * so its first two segments are always `"ws"` + the ACTIVE workspace id
 * (`apps/web/src/app/query/keys.ts`). That is what makes the shell's
 * `queryClient.clear()` on workspace switch / logout correct: no Calendar
 * entry can outlive, or be read across, its owning workspace.
 *
 * The VISIBLE RANGE is part of the key as well as the workspace, because the
 * Calendar payload is a composition over one specific `[from, to)` window —
 * two windows are two different resources, not two states of one. Keying on
 * the workspace alone would let yesterday's payload be served for today.
 */
import { wsKey } from "../../../app/query/keys.js";

export function calendarKey(workspaceId: string, from: string, to: string): readonly string[] {
  return wsKey(workspaceId, "calendar", "window", from, to);
}
