# Contract — Active Workspace Context

Implements workspace selection/switching (FR-033c) and the session/context read used by the shell bootstrap (FR-039).

## `GET /v1/me` — current session + workspace context

- **Auth**: valid session. **State-changing**: no.
- **200** `application/json`:
  ```
  {
    "user": { "id": "<UserId>", "displayName": "...", "email": "..." },
    "activeWorkspace": null | {
      "id": "<WorkspaceId>",
      "name": "...",
      "role": "owner|admin|manager|staff",
      "permissions": ["members:invite", "members:manage", ...]
    },
    "workspaces": [ { "id": "<WorkspaceId>", "name": "...", "role": "..." }, ... ],
    "session": { "expiresAt": "<RFC3339>" }
  }
  ```
- **401** `problem+json` (`.../problems/session-invalid`) — no/invalid session.
- The SPA calls this on load to render the shell, choose the workspace switcher state, and seed workspace-scoped query keys `['ws', activeWorkspace.id, ...]`.

## `POST /v1/auth/session/workspace` — select / switch active workspace

- **Auth**: valid session. **State-changing**: yes → CSRF required.
- **Request** `application/json`:
  ```
  { "workspaceId": "<WorkspaceId>" }
  ```
- **200** `application/json` — same shape as `GET /v1/me` with the new `activeWorkspace`; `Set-Cookie` with a **rotated** session id.
- **403** `problem+json` (`.../problems/not-a-member`) — the user has no active membership in that workspace. The response reveals nothing about whether the workspace exists.
- **409** `problem+json` (`.../problems/workspace-unavailable`) — workspace or membership is `suspended`.
- **400** `problem+json` (`.../problems/validation`) — malformed body.

### Client obligation on switch

On a successful switch the web client MUST clear the entire server-state cache and re-fetch from `GET /v1/me` before rendering tenant data (FR-013, FR-033c). This is verified by **E2E journey 6**: after switching from workspace A to workspace B, no workspace-A data is visible anywhere in the shell.

## Acceptance

- Switching updates `activeWorkspace` and rotates the session id.
- Attempting to switch to a workspace the user does not belong to returns `403` with no existence disclosure.
- E2E journey 6 (workspace-switch isolation) passes in CI (SC-017).
- Integration test: after switch, a tenant query in the same session resolves against the new `app.workspace_id` only (RLS backstop verified).
