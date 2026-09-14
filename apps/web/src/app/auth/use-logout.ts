import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { signOut } from "./session-api.js";

/**
 * DELETE /v1/auth/session (contracts/session.contract.md). Revokes the
 * session server-side; the cache is cleared only in `onSuccess`, so a
 * failed sign-out request leaves the authenticated shell state intact
 * rather than performing a fake client-only logout.
 */
export function useLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
