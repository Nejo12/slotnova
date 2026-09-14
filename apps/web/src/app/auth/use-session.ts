import { useQuery } from "@tanstack/react-query";

import { meKey } from "../query/keys.js";
import {
  fetchMe,
  SessionInvalidError,
  type ActiveWorkspace,
  type MeResponse,
} from "./session-api.js";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export interface SessionState {
  status: SessionStatus;
  me: MeResponse | undefined;
  activeWorkspace: ActiveWorkspace | null | undefined;
}

/**
 * GET /v1/me as the server-authoritative session read (contracts/
 * workspace-context.contract.md). This is the only source of truth for
 * "is there a valid session" and "what is the active workspace" — never a
 * client-local flag or a decoded token claim (FR-027, hard invariant: no
 * localStorage JWT).
 */
export function useSession(): SessionState {
  const query = useQuery({
    queryKey: meKey(),
    queryFn: fetchMe,
    retry: (_failureCount, error) => !(error instanceof SessionInvalidError),
  });

  const status: SessionStatus = query.isPending
    ? "loading"
    : query.isError
      ? "signed-out"
      : "signed-in";

  return {
    status,
    me: query.data,
    activeWorkspace: query.data?.activeWorkspace,
  };
}
