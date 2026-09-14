import { useState } from "react";

const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3001";
export const TEST_HARNESS_MARKER = "SLOTNOVA_E2E_HARNESS_MARKER";

interface WorkspaceSummary {
  id: string;
  name: string;
  role: string;
}

interface MeResponse {
  user: { email: string; displayName: string };
  activeWorkspace: null | (WorkspaceSummary & { permissions: string[] });
  workspaces: WorkspaceSummary[];
}

interface ProblemResponse {
  status?: number;
  type?: string;
  requiredCapability?: string;
  detail?: string;
}

function csrfFromCookie(): string {
  const pair = document.cookie.split("; ").find((entry) => entry.startsWith("slotnova_csrf="));
  return pair?.slice("slotnova_csrf=".length) ?? "";
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...init, credentials: "include" });
}

async function fetchMe(): Promise<MeResponse> {
  const response = await api("/v1/me");
  if (!response.ok) throw new Error(`GET /v1/me failed: ${response.status}`);
  return response.json() as Promise<MeResponse>;
}

export function TestHarness(): React.JSX.Element {
  const [email, setEmail] = useState("owner@example.test");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [foundation, setFoundation] = useState<MeResponse["activeWorkspace"]>(null);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("new-member@example.test");
  const [actionStatus, setActionStatus] = useState<number | null>(null);
  const [problem, setProblem] = useState<ProblemResponse | null>(null);

  async function refresh(): Promise<void> {
    const [nextMe, records] = await Promise.all([fetchMe(), fetchMe()]);
    setMe(nextMe);
    setFoundation(records.activeWorkspace);
  }

  async function signIn(): Promise<void> {
    setBusy(true);
    try {
      const csrf = await api("/v1/auth/csrf").then(
        (response) => response.json() as Promise<{ csrfToken: string }>,
      );
      const response = await api("/v1/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf.csrfToken },
        body: JSON.stringify({ credential: { seededUserEmail: email } }),
      });
      if (!response.ok) throw new Error(`Sign in failed: ${response.status}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function switchWorkspace(workspaceId: string): Promise<void> {
    setBusy(true);
    setMe(null);
    setFoundation(null);
    try {
      const response = await api("/v1/auth/session/workspace", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfFromCookie() },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error(`Workspace switch failed: ${response.status}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function invite(): Promise<void> {
    const response = await api("/v1/invitations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfFromCookie() },
      body: JSON.stringify({ email: inviteEmail, role: "staff" }),
    });
    setActionStatus(response.status);
    setProblem(response.ok ? null : ((await response.json()) as ProblemResponse));
  }

  return (
    <main data-testid="test-harness" data-marker={TEST_HARNESS_MARKER}>
      <h1>Slotnova test harness</h1>
      {!me ? (
        <section aria-label="Sign in">
          <label>
            Seeded user email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button type="button" onClick={() => void signIn()} disabled={busy}>
            Sign in
          </button>
        </section>
      ) : (
        <>
          <p data-testid="signed-in-user">Signed in: {me.user.email}</p>
          <p data-testid="active-workspace">
            Active workspace: {me.activeWorkspace?.name ?? "none"}
          </p>
          <section aria-label="Workspace switcher">
            {me.workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => void switchWorkspace(workspace.id)}
                disabled={busy || workspace.id === me.activeWorkspace?.id}
              >
                Use {workspace.name}
              </button>
            ))}
          </section>
          <section aria-label="Active workspace foundation records">
            {foundation ? (
              <p data-testid="foundation-membership">
                Membership record: {foundation.name} / {foundation.role}
              </p>
            ) : (
              <p>Foundation records: loading</p>
            )}
          </section>
          <section aria-label="Protected invitation action">
            <label>
              Invite email
              <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </label>
            <button type="button" onClick={() => void invite()}>
              Issue invitation
            </button>
            {actionStatus !== null ? <p data-testid="action-status">HTTP {actionStatus}</p> : null}
            {problem ? <pre data-testid="problem-response">{JSON.stringify(problem)}</pre> : null}
          </section>
        </>
      )}
    </main>
  );
}
