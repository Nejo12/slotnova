# Data Model — Phase 1 Platform Foundation

**Scope**: the minimal foundation schema only (FR-023). No product-domain entity is defined here (FR-070). Persisted instants are `timestamptz`; identifiers are opaque/branded (`UserId`, `WorkspaceId`, `LocationId`, `MembershipId`, `InvitationId`, `SessionId`, `AuditRecordId`, `OutboxRecordId`, `JobId`). Schema ownership is per-module (ADR-004): `identity`, `audit`, `platform`.

## Module ownership

| Module | Owns | Notes |
|---|---|---|
| `identity` | `users`, `workspaces`, `locations`, `memberships`, `invitations`, `sessions` | The tenancy + auth spine |
| `audit` | `audit_records` | Append-only at DB-privilege level (FR-032) |
| `platform` | `outbox_records`, scheduler-owned tables (from the R3 library) | Outbox and scheduler are **separate** concerns (ADR-005/014) |
| `packages/db` (not a module) | `schema_migrations` | Migration-runner bookkeeping; owned by `packages/db`, not by any module |

No module imports another module's schema or repository; cross-module needs go through application ports (constitution III).

## Tenant-ownership & RLS matrix

| Table | Tenant-owned? | `workspace_id` | `location_id` | RLS policy | Access path |
|---|---|---|---|---|---|
| `users` | No | — | — | none | `identity` platform-scoped repo (narrowly reviewed) |
| `workspaces` | No (is the tenant root) | own `id` | — | none | `identity` platform-scoped repo |
| `locations` | **Yes** | required | — | `USING (workspace_id = current_setting('app.workspace_id')::uuid)` | `identity` workspace-scoped repo |
| `memberships` | **Yes** | required | — | same predicate | workspace-scoped repo |
| `invitations` | **Yes** | required | — | same predicate | workspace-scoped repo |
| `sessions` | No (keyed by user) | stores active `workspace_id` as data | — | none | `identity` session repo only |
| `audit_records` | **Yes** (carry workspace) | required | optional | read policy workspace-scoped; **no** UPDATE/DELETE grant to app role | `audit` write port; append-only |
| `outbox_records` | carries `workspace_id` as context | required (nullable for platform events) | — | not RLS-gated (worker runs with elevated, workspace set per-dispatch) | `platform` outbox writer / worker claim |
| scheduler tables | library-managed | n/a | — | n/a | R3 library |
| `schema_migrations` | No | — | — | none | migration runner |

**Every tenant-owned table (`locations`, `memberships`, `invitations`, `audit_records`) MUST have RLS enabled + FORCE and a policy present; the isolation suite asserts this for 100% of tenant-owned tables (FR-029, FR-033, SC-003).**

## Tenant context contract (`SET LOCAL`)

- Every request/job that touches tenant-owned data opens a transaction and issues `SET LOCAL app.workspace_id = $1` (and `app.user_id`, `app.request_id` for audit/telemetry) **before** any tenant query, in the **same transaction**.
- The application connects as a role that is subject to RLS (never `BYPASSRLS`). A separate migration/admin role is used only by the gated migration runner.
- Repositories for tenant-owned tables are workspace-scoped by construction (they require a context object); there is no unscoped `find()` on tenant data (FR-030).
- The worker sets `app.workspace_id` per outbox record before dispatching its handler.
- Under a transaction-mode connection pooler, context + tenant work stay in one transaction so `SET LOCAL` cannot leak across pooled sessions (see research R1).

## Entities

### User (`identity.users`) — not tenant-owned
| Field | Type | Rules |
|---|---|---|
| `id` | `UserId` (uuid) | PK |
| `external_ref` | text, nullable | opaque handle from the credential adapter (dev or production); unique when present |
| `email` | citext | unique; used for invitation matching and display; **not** a credential store |
| `display_name` | text | |
| `status` | enum `active \| disabled` | disabled users cannot start a session |
| `created_at` / `updated_at` | `timestamptz` | |

- Credentials/passwords/MFA secrets are **not** stored here — verification is the credential adapter's responsibility (FR-027).

### Workspace (`identity.workspaces`) — tenant root
| Field | Type | Rules |
|---|---|---|
| `id` | `WorkspaceId` (uuid) | PK; this value is the tenant key everywhere else |
| `name` | text | |
| `slug` | text | unique; used in URLs/`__Host-` reasoning is domain-level not slug-level |
| `status` | enum `active \| suspended` | suspended ⇒ sessions cannot select it |
| `created_at` / `updated_at` | `timestamptz` | |

### Location (`identity.locations`) — tenant-owned
| Field | Type | Rules |
|---|---|---|
| `id` | `LocationId` (uuid) | PK |
| `workspace_id` | `WorkspaceId` | FK → `workspaces`; RLS predicate column |
| `name` | text | |
| `timezone` | text (IANA zone id) | **data only in Phase 1**; validated as a real IANA id; no scheduling behavior (ADR-010) |
| `status` | enum `active \| archived` | |
| `created_at` / `updated_at` | `timestamptz` | |

- Phase 1 does **not** enforce location-level authorization; `location_id` scoping on operational records begins in later phases. `Location` exists now so Scheduling/Booking can own timezone-aware behavior against a real location later.

### Membership (`identity.memberships`) — tenant-owned
| Field | Type | Rules |
|---|---|---|
| `id` | `MembershipId` (uuid) | PK |
| `workspace_id` | `WorkspaceId` | RLS predicate column |
| `user_id` | `UserId` | FK → `users` |
| `role` | enum `owner \| admin \| manager \| staff` (Phase 1 baseline set) | drives the default permission set |
| `permissions` | text[] / permission set | explicit capability list; server-side authorization reads this (FR-031); custom roles are a later concern |
| `status` | enum `active \| suspended` | |
| `created_at` / `updated_at` | `timestamptz` | |

- Unique `(workspace_id, user_id)` — a user has at most one membership per workspace.
- At least one `owner` per workspace is an invariant (cannot remove/downgrade the last owner).

### Invitation (`identity.invitations`) — tenant-owned
| Field | Type | Rules |
|---|---|---|
| `id` | `InvitationId` (uuid) | PK |
| `workspace_id` | `WorkspaceId` | RLS predicate column |
| `email` | citext | invitee address |
| `role` | enum (as membership) | role the invitee will receive |
| `token_hash` | text | hash of a high-entropy token; the raw token is delivered out-of-band and never stored |
| `status` | enum `pending \| accepted \| revoked \| expired` | |
| `expires_at` | `timestamptz` | short server-authoritative TTL |
| `invited_by` | `MembershipId` | must have permission to invite |
| `accepted_by_user_id` | `UserId`, nullable | set on acceptance |
| `created_at` / `updated_at` | `timestamptz` | |

- Token is single-use: acceptance transitions `pending → accepted` atomically with membership creation; a partial unique index (`workspace_id`, `email`) `WHERE status = 'pending'` prevents duplicate live invitations.
- Expired/used/revoked tokens are refused (FR-033b); revocation is `pending → revoked`.

### Session (`identity.sessions`) — not tenant-owned (keyed by user)
| Field | Type | Rules |
|---|---|---|
| `id` | `SessionId` (uuid) | PK; the opaque cookie value maps to this (hashed) |
| `user_id` | `UserId` | FK → `users` |
| `active_workspace_id` | `WorkspaceId`, nullable | null until the user selects/has a workspace |
| `created_at` | `timestamptz` | |
| `last_seen_at` | `timestamptz` | sliding activity |
| `expires_at` | `timestamptz` | absolute + sliding expiry (server-authoritative time) |
| `revoked_at` | `timestamptz`, nullable | set on sign-out / forced revocation |
| `rotated_from` | `SessionId`, nullable | audit chain across rotations |
| `client_hint` | jsonb | coarse UA / IP hint for anomaly detection; not PII-heavy |

- A session is valid iff `revoked_at IS NULL AND expires_at > now()` and the user + active workspace are still active.
- Rotate `id` on: sign-in, workspace switch, permission/role change to the active membership, sliding-rotation interval.

### AuditRecord (`audit.audit_records`) — tenant-owned, append-only
| Field | Type | Rules |
|---|---|---|
| `id` | `AuditRecordId` (uuid) | PK |
| `workspace_id` | `WorkspaceId` | RLS read predicate |
| `actor_user_id` | `UserId`, nullable | null for system actions |
| `action` | text | stable event name (e.g. `membership.role_changed`) |
| `entity_type` / `entity_id` | text | reference to the changed entity |
| `metadata` | jsonb | before/after or reason, PII-minimized |
| `request_id` | text | correlation id (FR-032, FR-054) |
| `occurred_at` | `timestamptz` | server time |

- The application DB role has `INSERT` + `SELECT` only; **no** `UPDATE`/`DELETE` grant (FR-032, enforced by migration).
- Phase 1 emits audit records for: invitation issued/accepted/revoked, membership created/role-changed/suspended, permission changes, session forced-revocation.

### OutboxRecord (`platform.outbox_records`)
| Field | Type | Rules |
|---|---|---|
| `id` | `OutboxRecordId` (uuid) | PK |
| `workspace_id` | `WorkspaceId`, nullable | context for tenant-scoped events; null for platform events |
| `event_name` | text | stable, from the event catalogue (FR-045, ADR-024) |
| `event_version` | int | starts at 1 |
| `payload` | jsonb | versioned schema; PII-minimized; carries `request_id` |
| `occurred_at` | `timestamptz` | |
| `available_at` | `timestamptz` | = `occurred_at` for outbox (delay is the scheduler's job, not the outbox's) |
| `claimed_at` / `claimed_by` | nullable | claim via `FOR UPDATE SKIP LOCKED` |
| `processed_at` | nullable | set when all handlers succeeded |
| `attempts` | int | bounded; on exhaustion → `dead_lettered_at` |
| `dead_lettered_at` | `timestamptz`, nullable | explicit parked state (FR-043) |

- Written **in the same transaction** as the business state change (FR-040). Foundation producer: identity events (`workspace.created`, `membership.created`, `invitation.accepted`, …) — used only to exercise the spine in Phase 1; real consumers arrive in Phase 3+.
- Retention: processed records older than N days are archived/pruned by a scheduled job (FR-044).

### ScheduledJob (`platform`, library-owned tables from R3)
Conceptual shape (the R3 library provides the storage):
| Concept | Rules |
|---|---|
| identity | opaque job id |
| `run_after` | delay honored with server-authoritative time |
| `max_attempts` + backoff | bounded retry (FR-043) |
| terminal failure | explicit dead-letter/parked outcome + alert |
| claiming | `SKIP LOCKED`; no job runs on two workers (FR-041, FR-046) |

Foundation jobs in Phase 1: expired-session cleanup, expired-invitation sweep, outbox retention/prune. No product jobs.

### SchemaMigration (`schema_migrations`)
Migration-runner bookkeeping (applied version, checksum, applied_at). **Owned by `packages/db`** (not by any backend module); written only by the `packages/db` migration runner, and the gated release step is the only writer in staging/production (FR-060).

## State transitions

### Invitation
```text
pending ──accept (valid token, not expired, matches email)──▶ accepted   [+ membership created, + audit, + outbox]
pending ──revoke (by authorized member)────────────────────▶ revoked
pending ──TTL elapsed (swept)─────────────────────────────▶ expired
accepted | revoked | expired ──(any further use)───────────▶ refused (no state change)
```

### Session
```text
(none) ──sign-in via credential adapter──▶ active (active_workspace_id = null or sole workspace)
active ──select / switch workspace───────▶ active' (id rotated, active_workspace_id set, web cache cleared)
active ──permission/role change──────────▶ active' (id rotated)
active ──sign-out────────────────────────▶ revoked (revoked_at set; cookie cleared)
active ──expires_at passed───────────────▶ expired (fails closed on next use)
active ──forced revocation (admin)───────▶ revoked (+ audit)
```

### Membership
```text
(none) ──invitation accepted──▶ active (role + permissions from invitation)
active ──role/permission change (authorized, not last-owner-downgrade)──▶ active' (+ audit, + session rotation for that user)
active ──suspend────────────▶ suspended (sessions with this active workspace fail closed)
suspended ──reinstate───────▶ active
```

## Validation rules (from requirements)

- `Location.timezone` must be a valid IANA zone id (ADR-010) — rejected otherwise.
- Invitation token: high-entropy, single-use, `expires_at` server-set and short; only the hash is stored.
- Cannot remove or downgrade the **last** `owner` membership of a workspace.
- A session cannot select a `suspended` workspace or one where the user's membership is `suspended`.
- `audit_records` and `outbox_records` payloads must pass a PII-minimization check (no configured sensitive field) (FR-057).
- No tenant-owned row may be created without an `app.workspace_id` set in the transaction (RLS + `WITH CHECK`).

## Explicit non-entities (Phase 1 scope guard)

No `Service`, `Booking`, `Appointment`, `AvailabilityRule`, `Vacancy`, `Offer`, `Payment`, `Refund`, `Message`, `NotificationTemplate`, `StockItem`, `Campaign`, `AnalyticsProjection`, or any other product entity is created in Phase 1 (FR-070, SC-014). Placeholder routes in the shell render empty states only.
