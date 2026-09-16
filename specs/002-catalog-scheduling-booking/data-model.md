# Data Model — Phase 2 Catalog, Scheduling & Booking

Scope: Catalog, Scheduling, Booking schema only. Calendar has no schema
(`research.md` R-CAL). Identifiers are opaque/branded (`ServiceId`,
`ServiceCategoryId`, `ServiceAddOnId`, `AvailabilityPatternId`,
`AvailabilityExceptionId`, `BookingId`). Persisted instants are
`timestamptz`; recurrence rules store local wall-time + IANA timezone
strings, never a bare `Date` (ADR-010).

This model assumes the Founder decisions in `plan.md` (`Q1`/`Q2`/`Q3`/`Q7`)
resolve as recommended in `research.md`. If they resolve differently,
`resource_id`/`location_id` participation in the exclusion constraint and
the persistence of `Draft` are the only structural changes required — noted
inline below.

## Module ownership

| Module | Owns | Notes |
|---|---|---|
| `catalog` | `services`, `service_categories`, `service_add_ons`, `staff_service_capabilities` | Supporting tier; domain layer only for duration/buffer/add-on invariants (ADR-012) |
| `scheduling` | `availability_patterns`, `availability_exceptions` | Core tier |
| `booking` | `bookings` | Core tier |
| — | (none) | Calendar has no owned table (`research.md` R-CAL) |

Cross-module references (Booking → Service, Booking → AvailabilityPattern
resource, Booking → staff/client identity) are by opaque id only, never a
foreign-key join across module schemas in application code (constitution
III) — enforced at the ORM/repository layer, not by a cross-schema SQL FK
in the initial migration (a same-database FK is acceptable for referential
integrity per existing repo convention **only if** Phase 1 already does
this for cross-module refs; otherwise keep it a soft reference validated at
the application boundary — confirm against Phase 1's actual `identity` ↔
other-module FK precedent during PR-01 implementation, not assumed here).

## Tenant-ownership & RLS matrix

| Table | Tenant-owned? | `workspace_id` | RLS | FORCE RLS | Policy subject | Indexes |
|---|---|---|---|---|---|---|
| `services` | Yes | required | enabled | yes | `workspace_id = current_setting('app.workspace_id')::uuid` | `(workspace_id)`, `(workspace_id, active)` |
| `service_categories` | Yes | required | enabled | yes | same predicate | `(workspace_id)` |
| `service_add_ons` | Yes | required | enabled | yes | same predicate | `(workspace_id)`, `(workspace_id, service_id)` |
| `staff_service_capabilities` | Yes | required | enabled | yes | same predicate | `(workspace_id, staff_id)`, `(workspace_id, service_id)` |
| `availability_patterns` | Yes | required | enabled | yes | same predicate | `(workspace_id, resource_id)` |
| `availability_exceptions` | Yes | required | enabled | yes | same predicate | `(workspace_id, resource_id, starts_at)` |
| `bookings` | Yes | required | enabled | yes | same predicate | `(workspace_id, resource_id)`, GiST on `blocking_range` (see exclusion constraint) |

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
| `category_id` | `ServiceCategoryId` \| null | optional, `research.md` R-CAT |
| `name` | text | required |
| `duration_minutes` | integer | ≥ 1 |
| `pre_buffer_minutes` | integer | ≥ 0, default 0 |
| `post_buffer_minutes` | integer | ≥ 0, default 0 |
| `price_amount_minor` | bigint | ADR-015 minor units |
| `price_currency` | text (ISO 4217) | ADR-015 |
| `active` | boolean | default true |
| `created_at` / `updated_at` | timestamptz | |

Validation: `duration_minutes >= 1`, buffers `>= 0`, `price_amount_minor >= 0`.

### ServiceCategory (`catalog.service_categories`) — optional (R-CAT)

| Field | Type | Notes |
|---|---|---|
| `id` | `ServiceCategoryId` | PK |
| `workspace_id` | uuid | tenant scope |
| `name` | text | required |
| `sort_order` | integer | default 0 |

### ServiceAddOn (`catalog.service_add_ons`) — only if R-ADDON is accepted

| Field | Type | Notes |
|---|---|---|
| `id` | `ServiceAddOnId` | PK |
| `workspace_id` | uuid | tenant scope |
| `service_id` | `ServiceId` | which Service it attaches to |
| `name` | text | required |
| `price_delta_minor` | bigint \| null | null = no price effect |
| `duration_delta_minutes` | integer \| null | null = no duration effect |

Semantics: an add-on with both fields null is informational only; both set
means it affects both. No generic modifier/discount engine (`research.md`
R-ADDON).

### StaffServiceCapability (`catalog.staff_service_capabilities`)

| Field | Type | Notes |
|---|---|---|
| `id` | `StaffServiceCapabilityId` | PK |
| `workspace_id` | uuid | tenant scope |
| `staff_id` | opaque reference (Identity-owned) | Catalog stores the association only, not the staff profile |
| `service_id` | `ServiceId` | |
| `created_at` | timestamptz | |

Unique on `(workspace_id, staff_id, service_id)`. Catalog never creates,
updates, or deletes staff identity/profile rows (ADR-012 boundary).

### AvailabilityPattern (`scheduling.availability_patterns`)

| Field | Type | Notes |
|---|---|---|
| `id` | `AvailabilityPatternId` | PK |
| `workspace_id` | uuid | tenant scope |
| `resource_id` | opaque reference | staff id, or a synthetic workspace-level resource id if R-SCOPE's fallback applies |
| `location_id` | uuid \| null | `research.md` R-LOCATION; nullable until multi-location UI ships |
| `timezone` | text (IANA) | e.g. `Europe/London` |
| `weekly_rule` | jsonb | day-of-week → local `[start,end)` wall-time intervals; validated shape, not freeform |
| `effective_from` / `effective_until` | date \| null | optional bounds on the recurrence itself |
| `created_at` / `updated_at` | timestamptz | |

### AvailabilityException (`scheduling.availability_exceptions`)

| Field | Type | Notes |
|---|---|---|
| `id` | `AvailabilityExceptionId` | PK |
| `workspace_id` | uuid | tenant scope |
| `resource_id` | opaque reference | matches the pattern's resource |
| `starts_at` / `ends_at` | timestamptz | half-open `[starts_at, ends_at)`, always resolved instants (not recurring) |
| `reason` | text \| null | e.g. "time off" |

Precedence: an exception always subtracts from recurring pattern output for
its overlapping span, regardless of the pattern's own rule (FR-012).

### Booking (`booking.bookings`)

| Field | Type | Notes |
|---|---|---|
| `id` | `BookingId` | PK |
| `workspace_id` | uuid | tenant scope |
| `resource_id` | opaque reference | protected-resource key component (`research.md` R-EXCL) |
| `location_id` | uuid \| null | protected-resource key component if R-LOCATION's UI scope is accepted; otherwise carried but unused in the constraint |
| `service_id` | `ServiceId` | reference only, no cross-schema FK required beyond app-level validation |
| `client_id` | opaque reference (Clients-owned) | reference only |
| `starts_at` | timestamptz | booking service start |
| `service_duration_minutes` / `pre_buffer_minutes` / `post_buffer_minutes` | integer | snapshotted from Service at creation time (so later Service edits don't retroactively change historical blocking intervals) |
| `blocking_range` | `tstzrange`, generated | `[starts_at - pre_buffer, starts_at + service_duration + post_buffer)` |
| `status` | enum | `draft` \| `pending` \| `confirmed` \| `completed` \| `cancelled` (Q1/Q2-dependent — see below) |
| `version` | integer | optimistic concurrency (`research.md` R-OCC), default 1, incremented on every mutating transition |
| `cancelled_reason` | text \| null | set only on cancellation |
| `created_at` / `updated_at` | timestamptz | |

**If Q1 resolves "Draft does not persist"**: remove `draft` from the
persisted enum; the API's Draft/Review step operates on an unsaved
client-side/request-scoped representation and the first persisted row is
created at `pending` or `confirmed`. The table shape above already
accommodates this (simply never write a `draft` row) so no migration
branch is needed regardless of which way Q1 resolves.

## Exclusion constraint (ADR-011, `research.md` R-EXCL)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE booking.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    workspace_id WITH =,
    resource_id WITH =,
    blocking_range WITH &&
  ) WHERE (status = ANY (ARRAY['pending', 'confirmed']));
```

(`location_id WITH =` is added to the constraint if Q7 confirms
multi-location scope is live in Phase 2; the column exists either way per
R-LOCATION so this is a constraint-definition change, not a schema
migration, when that Founder decision lands.)

`draft`, `completed`, and `cancelled` bookings are excluded from the
predicate — they never block capacity.

## State transitions

### Booking

| Source | Command | Destination | Required capability | Invariants | Idempotency | Audit | Outbox | Invalid-transition result |
|---|---|---|---|---|---|---|---|---|
| (none) | `CreateBooking` | `pending` or `confirmed` (Q2) | `booking:create` | blocking interval must not overlap another `pending`/`confirmed` booking for the same resource (DB-enforced) | client supplies an idempotency key; retried identical request with the same key returns the original booking, not a duplicate | audit record on create | `booking.created` (only if a real Phase-2-or-later consumer is confirmed — otherwise deferred, `research.md`) | n/a (initial transition) |
| `pending` | `ConfirmBooking` | `confirmed` | `booking:edit` | version match required | re-confirming an already-`confirmed` booking with the same version is a no-op success | audit record | `booking.confirmed` (if consumer confirmed) | `409 problem+json` invalid-transition if source is not `pending` |
| `pending`/`confirmed` | `RescheduleBooking` | same status, new `blocking_range` | `booking:edit` | version match required; new range re-checked by the same exclusion constraint | not idempotent by design (each reschedule is a distinct intent) — version guard prevents lost updates | audit record with old/new range | `booking.rescheduled` (if consumer confirmed) | `409` version conflict, or DB exclusion-constraint violation translated to `409` overlap conflict |
| `pending`/`confirmed` | `CancelBooking` | `cancelled` | `booking:cancel` | version match required; blocking interval released (constraint predicate excludes `cancelled`) | re-cancelling an already-`cancelled` booking with the same version is a no-op success | audit record with reason | `booking.cancelled` (if consumer confirmed) | `409` if source is `completed` (terminal, cannot cancel) |
| `confirmed` | `CompleteBooking` | `completed` | `booking:complete` | version match required; only reachable from `confirmed` | re-completing with same version is a no-op success | audit record | `booking.completed` (if consumer confirmed) | `409` if source is not `confirmed` |
| `cancelled`/`completed` | any command | — | — | terminal states | — | — | — | `409 problem+json` "booking is in a terminal state" |

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

- No `staff_profiles`/`staff_schedules` table — staff identity is
  referenced, not owned, by Catalog/Scheduling/Booking (ADR-012).
- No `calendar_*` table of any kind (`research.md` R-CAL).
- No payment/checkout/invoice table.
- No notification/message template or delivery table.
- No recovery offer/attribution table.
- No generic discount/modifier engine table beyond the narrow
  `service_add_ons` shape (if accepted).
