import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { meKey } from "../query/keys.js";
import { switchWorkspace, type MeResponse } from "./session-api.js";

/**
 * POST /v1/auth/session/workspace, honoring the contract's client
 * obligation exactly (contracts/workspace-context.contract.md "Client
 * obligation on switch"): after a successful switch, the client MUST clear
 * the entire server-state cache and re-fetch from GET /v1/me BEFORE
 * rendering tenant data. `onSuccess` below clears first, then seeds `me`
 * directly from the switch response (itself `/me`-shaped) rather than
 * issuing a second network round-trip — no stale workspace-A cache entry
 * can be read in between, since `clear()` removes it synchronously before
 * `setQueryData` runs.
 */
export function useWorkspaceSwitch(): UseMutationResult<MeResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: switchWorkspace,
    onSuccess: (me) => {
      queryClient.clear();
      queryClient.setQueryData(meKey(), me);
    },
  });
}
