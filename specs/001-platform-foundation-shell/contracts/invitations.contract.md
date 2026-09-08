# Contract — Workspace Invitations & Membership Acceptance

Implements FR-033b. Establishes the membership-join path and exercises tenant-scoped writes, authorization, audit and outbox.

## `POST /v1/invitations` — issue an invitation

- **Auth**: valid session + active workspace + `members:invite` permission. **State-changing**: yes → CSRF required.
- **Request** `application/json`:
  ```
  { "email": "invitee@example.com", "role": "admin|manager|staff" }
  ```
- **201** `application/json`:
  ```
  {
    "invitation": {
      "id": "<InvitationId>",
      "email": "invitee@example.com",
      "role": "manager",
      "status": "pending",
      "expiresAt": "<RFC3339>"
    }
  }
  ```
  - The raw token is delivered out-of-band (Phase 1: returned once to the caller in non-production environments / logged via the dev notification seam; a real delivery channel is Phase 3). Only the token **hash** is stored.
  - Writes an `audit_records` row (`invitation.issued`) and an `outbox_records` row (`invitation.issued` v1) in the same transaction.
- **403** `problem+json` (`.../problems/forbidden`) — missing `members:invite`; body names the required capability.
- **409** `problem+json` (`.../problems/invitation-exists`) — a `pending` invitation for that email already exists in this workspace.
- **409** `problem+json` (`.../problems/already-member`) — the email already maps to an active membership.
- **400** `problem+json` (`.../problems/validation`) — bad email/role, or `role: owner` (owner cannot be granted by invitation).

## `GET /v1/invitations/{token}` — preview an invitation (read-only)

- **Auth**: none — the token is the capability. **State-changing**: no (never mutates — link prefetch safe).
- **200** `application/json` (minimal, PII-light):
  ```
  { "workspaceName": "...", "role": "manager", "email": "invitee@example.com", "status": "pending", "expiresAt": "<RFC3339>" }
  ```
- **404** `problem+json` (`.../problems/invitation-not-found`) — unknown/garbage token (no distinction from a revoked one, to limit probing).
- **410** `problem+json` (`.../problems/invitation-expired`) — expired or already used or revoked.
- Rate-limited per token/IP (security baseline).

## `POST /v1/invitations/{token}/acceptance` — accept

- **Auth**: valid session (the accepting user must be signed in; their email must match the invitation). **State-changing**: yes → CSRF required.
- **Request**: empty body.
- **200** `application/json` — same shape as `GET /v1/me`, now including the new membership as `activeWorkspace` (session id rotated):
  ```
  { "user": {...}, "activeWorkspace": { "id": "...", "role": "manager", "permissions": [...] }, "workspaces": [...] }
  ```
  - In one transaction: `invitations.status → accepted`, `memberships` row created with the invited role + default permissions, `audit_records` (`invitation.accepted` + `membership.created`), `outbox_records` (`invitation.accepted` v1, `membership.created` v1). `SET LOCAL app.workspace_id` = the invitation's workspace.
- **403** `problem+json` (`.../problems/email-mismatch`) — signed-in user's email ≠ invitation email.
- **410** `problem+json` (`.../problems/invitation-expired`) — expired / already used / revoked. No membership created (FR-033b, SC-018).
- **409** `problem+json` (`.../problems/already-member`) — user already a member (idempotency guard; no duplicate/elevated membership).

## `DELETE`/revoke

Revocation (`pending → revoked`) is available via `PATCH /v1/invitations/{id}` `{ "status": "revoked" }` — auth: `members:invite`; writes an audit row. (Kept minimal; full member-management UI is Phase 6.)

## Acceptance

- Valid token → exactly the invited role's membership + audit + outbox, session rotated (SC-018).
- Expired/used/revoked token → refused, **no** membership change (SC-018, edge case "invitation token abuse").
- Replaying a used token does not grant a second membership or a higher role.
- Tenant-scoped: the invitation write is only visible within its workspace's RLS context (isolation suite).
