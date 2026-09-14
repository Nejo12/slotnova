/**
 * TanStack Query key factory (ADR-003, FR-013).
 *
 * `meKey` is session-level, not workspace-owned — it is how the shell
 * discovers the active workspace in the first place, so it deliberately
 * does not start with `["ws", ...]`.
 *
 * Every workspace-OWNED query (any future feature querying tenant data)
 * MUST be built with `wsKey`, whose first two segments are always the
 * literal `"ws"` and the active `workspaceId`. This is what makes a full
 * `queryClient.clear()` on logout/workspace-switch correct: nothing is
 * cached under a key that could outlive its owning workspace.
 */

export function meKey(): readonly ["me"] {
  return ["me"] as const;
}

export function wsKey(
  workspaceId: string,
  ...rest: readonly string[]
): readonly ["ws", string, ...string[]] {
  return ["ws", workspaceId, ...rest] as const;
}
