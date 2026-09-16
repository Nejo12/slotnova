# Data Model — Phase 2 Catalog, Scheduling & Booking

Scope: Catalog, Scheduling, Booking schema only. Calendar has no schema
(`research.md` R-CAL). Identifiers are opaque/branded (`ServiceId`,
`ServiceCategoryId`, `AvailabilityPatternId`, `AvailabilityExceptionId`,
`BookingId`). Persisted instants are `timestamptz`; recurrence rules store
local wall-time + IANA timezone strings, never a bare `Date` (ADR-010).

**This revision reflects Founder decisions made during review of the first
planning draft** (`spec.md` Clarifications, session 2026-09-16 Founder
review): no persisted `Draft`/`Pending` Booking state, direct `Confirmed`
creation, a single implicit workspace-level resource (no `resource_id`
column), no location scope (no `location_id` column), no staff-service
capability persistence, and no `client_id` on Booking. These are
simplifications relative to the first draft, not open items.

## Module ownership

| Module | Owns | Notes |
|---|---|---|
| `catalog` | `services`, `service_categories` | Supporting tier; domain layer only for duration/buffer invariants (ADR-012). No add-on or staff-capability table in Phase 2. |
| `scheduling` | `availability_patterns`, `availability_exceptions` | Core tier. Workspace-scoped only — no resource/location dimension. |
| `booking` | `bookings` | Core tier. No `resource_id`, `location_id`, or `client_id` column. |
| — | (none) | Calendar has no owned table (`research.md` R-CAL) |

Cross-module references (Booking → Service) are by opaque id only, never a
foreign-key join across module schemas in application code (constitution
III).

## Tenant-ownership & RLS matrix

| Table | Tenant-owned? | `workspace_id` | RLS | FORCE RLS | Policy subject | Indexes |
|---|---|---|---|---|---|---|
| `services` | Yes | required | enabled | yes | `workspace_id = current_setting('app.workspace_id')::uuid` | `(workspace_id)`, `(workspace_id, active)` |
| `service_categories` | Yes | required | enabled | yes | same predicate | `(workspace_id)` |
| `availability_patterns` | Yes | required | enabled | yes | same predicate | `(workspace_id)` |
| `availability_exceptions` | Yes | required | enabled | yes | same predicate | `(workspace_id, starts_at)` |
| `bookings` | Yes | required | enabled | yes | same predicate | `(workspace_id)`, GiST on `(workspace_id, blocking_range)` (see exclusion constraint) |

**Every table above MUST have RLS enabled + FORCE and a policy present;
the Phase-2 isolation suite asserts this for 100% of these tables (SC-005),
mirroring the Phase-1 precedent
(`specs/001-platform-foundation-shell/data-model.md`).**

## Tenant context contract

Identical to Phase 1: every request/transaction touching these tables
issues `SET LOCAL app.workspace_id = $1` before any query, in the same
transaction; the application connects as an RLS-subject role
(never `BYPASSRLS`); no unscoped `find()` exists on any table above
(ADR-008).

## Entities

### Service (`catalog.services`)

| Field | Type | Notes |
|---|---|---|
| `id` | `ServiceId` (uuid) | PK |
| `workspace_id` | uuid | tenant scope |
| `category_id` | `ServiceCategoryId` \| null | optional |
| `name` | text | required |
| `duration_minutes` | integer | ≥ 1 |
| `pre_buffer_minutes` | integer | ≥ 0, default 0 |
| `post_buffer_minutes` | integer | ≥ 0, default 0 |
| `price_amount_minor` | bigint | ADR-015 minor units |
| `price_currency` | text (ISO 4217) | ADR-015 |
| `active` | boolean | default true |
| `created_at` / `updated_at` | timestamptz | |

Validation: `duration_minutes >= 1`, buffers `>= 0`, `price_amount_minor >= 0`.

### ServiceCategory (`catalog.service_categories`)

| Field | Type | Notes |
|---|---|---|
| `id` | `ServiceCategoryId` | PK |
| `workspace_id` | uuid | tenant scope |
| `name` | text | required |
| `sort_order` | integer | default 0 |

No nesting, description, icon, or taxonomy fields (Founder-finalized
R-CAT).

### AvailabilityPattern (`scheduling.availability_patterns`)

| Field | Type | Notes |
|---|---|---|
| `id` | `AvailabilityPatternId` | PK |
| `workspace_id` | uuid | tenant scope — the sole resource dimension in Phase 2 |
| `timezone` | text (IANA) | e.g. `Europe/London` |
| `weekly_rule` | jsonb | day-of-week → local `[start,end)` wall-time intervals; validated shape, not freeform |
| `effective_from` / `effective_until` | date \| null | optional bounds on the recurrence itself |
| `created_at` / `updated_at` | timestamptz | |

No `resource_id` (Founder decision 3 — single implicit workspace-level
resource) and no `location_id` (Founder decision 4 — location scope
deferred entirely).

### AvailabilityException (`scheduling.availability_exceptions`)

| Field | Type | Notes |
|---|---|---|
| `id` | `AvailabilityExceptionId` | PK |
| `workspace_id` | uuid | tenant scope |
| `starts_at` / `ends_at` | timestamptz | half-open `[starts_at, ends_at)`, always resolved instants (not recurring) |
| `reason` | text \| null | e.g. "time off" |

Precedence: an exception always subtracts from recurring pattern output for
its overlapping span, regardless of the pattern's own rule (FR-012).

### Booking (`booking.bookings`)

| Field | Type | Notes |
|---|---|---|
| `id` | `BookingId` | PK |
| `workspace_id` | uuid | tenant scope — the protected-resource key (`research.md` R-EXCL) |
| `service_id` | `ServiceId` | reference only |
| `starts_at` | timestamptz | booking service start |
| `service_duration_minutes` / `pre_buffer_minutes` / `post_buffer_minutes` | integer | snapshotted from Service at creation time (so later Service edits don't retroactively change historical blocking intervals) |
| `blocking_range` | `tstzrange`, generated | `[starts_at - pre_buffer, starts_at + service_duration + post_buffer)` |
| `status` | enum | `confirmed` \| `completed` \| `cancelled` — **no `draft` or `pending` value exists in the Phase-2 enum** (Founder decisions 1 & 2) |
| `version` | integer | optimistic concurrency (`research.md` R-OCC), default 1, incremented on every mutating transition |
| `cancelled_reason` | text \| null | set only on cancellation |
| `created_at` / `updated_at` | timestamptz | |

**No `resource_id`** (single implicit workspace resource), **no
`location_id`** (deferred), **no `client_id`** (Founder decision 5 —
`research.md` R-CLIENTS; Phase 3 adds this via an additive migration).

Every Booking is created directly at `confirmed` — there is no
`CreateDraftBooking` or `CreatePendingBooking` command in Phase 2. `Draft`
and `Review` are entirely client-side/UI concepts with no server
representation (FR-020).

## Exclusion constraint (ADR-011, `research.md` R-EXCL)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE booking.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    workspace_id WITH =,
    blocking_range WITH &&
  ) WHERE (status = 'confirmed');
```

`workspace_id` is the entire protected-resource key — Phase 2 has no
`resource_id`/`location_id` column to add to it (see `research.md` R-EXCL
for why a dedicated synthetic resource id was rejected in favor of reusing
`workspace_id` directly). Only `confirmed` bookings participate in the
predicate; `completed` and `cancelled` are terminal and non-blocking. There
is no `draft`/`pending` value to exclude because those states do not exist
in the Phase-2 enum.

A future phase that adds multi-resource or multi-location scope drops and
recreates this constraint with the added column(s) as part of that phase's
own additive migration; it is not pre-declared here.

## State transitions

### Booking

| Source | Command | Destination | Required capability | Invariants | Idempotency | Audit | Outbox | Invalid-transition result |
|---|---|---|---|---|---|---|---|---|
| (none) | `CreateBooking` | `confirmed` | `booking:create` | blocking interval must not overlap another `confirmed` booking in the workspace (DB-enforced) | client supplies an idempotency key; retried identical request with the same key returns the original booking, not a duplicate | audit record on create | `booking.created` (only if a real Phase-2-or-later consumer is confirmed — otherwise deferred, `research.md`) | n/a (initial transition; there is no `pending`/`draft` source) |
| `confirmed` | `RescheduleBooking` | `confirmed`, new `blocking_range` | `booking:edit` | version match required; new range re-checked by the same exclusion constraint | not idempotent by design (each reschedule is a distinct intent) — version guard prevents lost updates | audit record with old/new range | `booking.rescheduled` (if consumer confirmed) | `409` version conflict, or DB exclusion-constraint violation translated to `409` overlap conflict |
| `confirmed` | `CancelBooking` | `cancelled` | `booking:cancel` | version match required; blocking interval released (constraint predicate excludes `cancelled`) | re-cancelling an already-`cancelled` booking with the same version is a no-op success | audit record with reason | `booking.cancelled` (if consumer confirmed) | `409` if source is `completed` (terminal, cannot cancel) |
| `confirmed` | `CompleteBooking` | `completed` | `booking:complete` | version match required; only reachable from `confirmed` | re-completing with same version is a no-op success | audit record | `booking.completed` (if consumer confirmed) | `409` if source is not `confirmed` |
| `cancelled`/`completed` | any command | — | — | terminal states | — | — | — | `409 problem+json` "booking is in a terminal state" |

There is no `ConfirmBooking` command in Phase 2 (no `pending` state to
confirm from — creation lands directly at `confirmed`). `Pending` is
documented as a future lifecycle extension point only: if a later phase
introduces an approval-required creation path, it would add a `pending`
enum value, a `ConfirmBooking` command, and a corresponding entry to this
table via its own additive migration — none of that exists in Phase 2.

All version-mismatch failures return `409 problem+json` type
`stale-write` distinct from the `409` overlap/terminal-state conflicts
(distinct `type` URIs in the problem body) so clients can branch UX
correctly (refetch-and-retry vs. show-conflict).

## Validation rules (from requirements)

- `Service.duration_minutes >= 1`; buffers `>= 0` (FR-001).
- `Service.price_amount_minor >= 0`, currency is a valid ISO 4217 code
  (ADR-015).
- `AvailabilityPattern.weekly_rule` intervals are half-open, non-overlapping
  within the same day (validated at write time, not just read time).
- `Booking.blocking_range` lower bound is always `<` upper bound
  (non-empty range) — enforced by a `CHECK` constraint in addition to the
  application computing it correctly.
- Every mutating Booking command requires a `version` matching the current
  row (R-OCC).

## Explicit non-entities (Phase 2 scope guard)

- No `staff_profiles`/`staff_schedules`/`staff_service_capabilities` table
  — staff identity does not exist as a Phase-2 concept at all; the
  staff-service capability requirement is a documented future
  Catalog↔Staff integration port, not a table (Founder decision 3).
- No `resource_id` column anywhere — single implicit workspace-level
  resource (Founder decision 3).
- No `location_id` column anywhere — location scope deferred entirely
  (Founder decision 4).
- No `client_id` column on Booking, and no booking-local customer/contact/
  profile table as a workaround — no customer/client identity entity
  exists on current `main`; Phase 3 adds this additively (Founder
  decision 5, `research.md` R-CLIENTS).
- No `service_add_ons` table — deferred pending concrete evidence
  (`research.md` R-ADDON).
- No `calendar_*` table of any kind (`research.md` R-CAL).
- No payment/checkout/invoice table.
- No notification/message template or delivery table.
- No recovery offer/attribution table.
- No `draft` or `pending` value in the Booking `status` enum.
