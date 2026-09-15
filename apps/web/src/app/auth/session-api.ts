const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3001";
const CSRF_HEADER_NAME = "x-csrf-token";

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: string;
}

export interface ActiveWorkspace extends WorkspaceSummary {
  permissions: string[];
}

export interface MeResponse {
  user: { id: string; displayName: string; email: string };
  activeWorkspace: ActiveWorkspace | null;
  workspaces: WorkspaceSummary[];
  session: { expiresAt: string };
}

export class SessionInvalidError extends Error {
  constructor() {
    super("Session is invalid or expired");
    this.name = "SessionInvalidError";
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function readCsrfCookie(): string {
  for (const name of ["__Host-slotnova_csrf", "slotnova_csrf"]) {
    const pair = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
    if (pair) return pair.slice(name.length + 1);
  }
  return "";
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include" });
}

/**
 * GET /v1/me — the server-authoritative session + active-workspace read
 * (contracts/workspace-context.contract.md). Used both to bootstrap the
 * shell and to re-seed workspace-scoped query keys after a switch.
 */
export async function fetchMe(): Promise<MeResponse> {
  const response = await api("/v1/me");
  if (response.status === 401) throw new SessionInvalidError();
  if (!response.ok) throw new ApiRequestError(`GET /v1/me failed`, response.status);
  return response.json() as Promise<MeResponse>;
}

/**
 * POST /v1/auth/session/workspace — switch the active workspace
 * (contracts/workspace-context.contract.md). Requires a valid CSRF token;
 * the server rotates the session id and returns the same shape as
 * `GET /v1/me` for the newly active workspace. The server remains the sole
 * authority on membership — this call never duplicates that check
 * client-side, it only surfaces the server's decision.
 */
export async function switchWorkspace(workspaceId: string): Promise<MeResponse> {
  const response = await api("/v1/auth/session/workspace", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CSRF_HEADER_NAME]: readCsrfCookie(),
    },
    body: JSON.stringify({ workspaceId }),
  });
  if (!response.ok) throw new ApiRequestError(`Workspace switch failed`, response.status);
  return response.json() as Promise<MeResponse>;
}

/**
 * DELETE /v1/auth/session — sign out (contracts/session.contract.md).
 * Revokes the session server-side; idempotent (204 even if already
 * invalid). The caller (useLogout) is responsible for clearing the
 * QueryClient cache — this function only performs the network call.
 */
export async function signOut(): Promise<void> {
  const response = await api("/v1/auth/session", {
    method: "DELETE",
    headers: { [CSRF_HEADER_NAME]: readCsrfCookie() },
  });
  if (!response.ok && response.status !== 204) {
    throw new ApiRequestError(`Sign out failed`, response.status);
  }
}
