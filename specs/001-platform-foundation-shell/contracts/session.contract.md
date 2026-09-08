# Contract — Session (sign in / sign out)

Implements the Slotnova-owned session spine (FR-025, FR-033a). Credential verification is delegated to the **credential adapter** (ADR-007, FR-027) — this contract does not define credential fields beyond an opaque adapter payload.

## `POST /v1/auth/session` — sign in

- **Auth**: none (this establishes it). **State-changing**: yes → CSRF token required (the SPA obtains a pre-session CSRF token from a safe bootstrap route).
- **Request** `application/json`:
  ```
  { "credential": { <adapter-specific opaque object> } }
  ```
  - Dev credential adapter: `{ "credential": { "seededUserEmail": "owner@example.test" } }` (local/test only).
  - Production-shaped adapter: an opaque token/assertion. The API forwards this to the active adapter and never interprets credential material itself.
- **200** `application/json` + `Set-Cookie` (rotated session id):
  ```
  {
    "user": { "id": "<UserId>", "displayName": "...", "email": "..." },
    "activeWorkspace": null | { "id": "<WorkspaceId>", "name": "...", "role": "owner|admin|manager|staff" },
    "workspaces": [ { "id": "<WorkspaceId>", "name": "...", "role": "..." }, ... ]
  }
  ```
  - `activeWorkspace` is set automatically when the user has exactly one active membership; otherwise `null` and the SPA must call the workspace-selection endpoint.
- **401** `problem+json` (`.../problems/invalid-credentials`) — adapter rejected the credential. No cookie set. Message is generic (no user-enumeration).
- **403** `problem+json` (`.../problems/user-disabled`) — user exists but `status = disabled`.
- **400** `problem+json` (`.../problems/validation`) — malformed body.
- **429** `problem+json` (`.../problems/rate-limited`) — too many attempts (auth endpoints are rate-limited per the security baseline).

## `DELETE /v1/auth/session` — sign out

- **Auth**: valid session. **State-changing**: yes → CSRF required.
- Revokes the session **server-side** (`revoked_at` set), clears the cookie.
- **204** no body. Idempotent — calling with an already-invalid session also returns `204`.
- Web client clears the entire server-state cache on success (FR-013, FR-033c).

## Session lifecycle (server-authoritative)

- Session id is rotated on sign-in, workspace switch, and membership/role/permission change for the active workspace (research R7).
- A session is invalid once `revoked_at` is set, `expires_at` passes, or the user/workspace/membership becomes inactive — all fail closed with **401** `problem+json` (`.../problems/session-invalid`) on the next request.

## Acceptance

- Sign-in via the dev adapter establishes a session that traverses the real session path (SC-016).
- Sign-out revokes server-side: replaying the old cookie after sign-out yields `401` (edge case "sign-out completeness").
- Contract tests: missing CSRF token → `403`; malformed body → `400` `problem+json`.
- E2E sign-in smoke journey passes (SC-017).
