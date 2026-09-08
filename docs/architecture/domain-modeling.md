# Domain Modeling Conventions

## Tenant boundary

Slotnova is multi-tenant from the beginning.

```text
Workspace
  └─ Location
       └─ operational records

User
  └─ Membership(workspaceId, role, permissions)
```

Every tenant-owned record carries `workspaceId`; location-scoped records also carry `locationId` where appropriate. This is not only a naming convention.

### Database enforcement

- PostgreSQL Row Level Security (RLS) is required on tenant-owned tables.
- Request/worker transactions establish tenant context with transaction-scoped configuration (`SET LOCAL app.workspace_id = ...` or equivalent).
- Repository APIs are tenant-scoped by construction; unscoped reads are forbidden outside narrowly reviewed platform/admin tooling.
- CI/integration tests must assert every tenant-owned table has RLS enabled and policies present.
- Generated/parameterized tenant-isolation tests must prove workspace A cannot read or mutate workspace B resources.

## Identity types

Use opaque/branded identifiers for high-value domain IDs rather than interchangeable strings, e.g. `BookingId`, `ClientId`, `WorkspaceId`, `RecoveryOfferId`.

## Time model

Domain scheduling uses explicit temporal concepts:

- `Instant` — exact UTC point in time
- `LocalDate` — calendar date without time
- `LocalTime` — wall-clock time without date
- `TimeZone` — IANA zone id such as `Europe/Berlin`
- `Duration`

Use Temporal semantics as the canonical domain API (via `@js-temporal/polyfill` until native runtime support is deliberately adopted). Raw JavaScript `Date` is not used for domain scheduling logic.

### Storage rules

- persisted instants use PostgreSQL `timestamptz`
- business/location timezone is stored as an IANA zone id, never just a UTC offset
- recurring availability stores local wall-time rules + timezone, then resolves occurrences to instants
- intervals are half-open `[start, end)` everywhere
- booking blocking intervals include pre/post buffers, not only customer-facing appointment time
- DST gap/overlap days and future zone-rule changes require dedicated tests

## Booking overlap prevention

Application-level availability checks improve UX but are not the correctness boundary. PostgreSQL must reject conflicting bookings with a database exclusion constraint over the staff/resource blocking interval.

Illustrative shape:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(blocking_starts_at, blocking_ends_at, '[)') WITH &&
)
WHERE (status IN ('pending', 'confirmed'));
```

Exact columns/statuses are finalized in the Booking schema ADR. Concurrency tests must use genuinely independent database connections.

## Money model

Never store or calculate money using binary floating point.

```text
amountMinor: integer
currency: ISO-4217 code
```

The currency determines its minor-unit exponent; never assume two decimals. Proportional allocation (discounts, tax, partial refunds) uses deterministic largest-remainder allocation so allocated parts sum exactly to the original amount.

Tax-inclusive vs tax-exclusive pricing, discount/tax/tip operation order and deposit tax treatment are explicit business rules, not presentation concerns.

## Catalog ownership

Catalog owns services/categories, duration, pre/post buffers, price, add-ons and staff-service capability. Booking, Scheduling, Recovery and Payments consume Catalog through application ports rather than duplicating these values.

## Booking lifecycle

```text
Draft → Review → Pending/Confirmed → Completed
                       ↘ Cancelled
                       ↘ No-show
```

Cancellation/no-show may create recoverable capacity. Recovery is not a Booking status.

User-editable aggregates should use optimistic concurrency/version checks where concurrent edits are plausible.

## Recovery engine

Recovery is modeled as explicit state machines/process orchestration rather than a chain of browser requests.

### Vacancy lifecycle

```text
Open
→ Ranked
→ Offering
→ Recovered
   or Expired/Closed
```

### Offer lifecycle

```text
Created
→ Sent
→ Pending
→ Accepted | Declined | Expired | Superseded | Failed
```

### Required invariants

- first **valid** acceptance wins
- acceptance validity (token, expiry, vacancy state, client eligibility) is re-checked inside the acceptance transaction
- at most one accepted offer exists per vacancy, enforced in the database where practical (e.g. partial unique constraint)
- acceptance creates/updates exactly one recovered booking
- competing offers close/supersede deterministically
- retries are idempotent; external delivery is at-least-once safe
- booking/calendar transition succeeds before client-history and attribution side effects are considered complete
- recovered-revenue attribution is exactly-once
- value-at-risk is an immutable snapshot for the recovery run; later price changes do not rewrite history
- ranking is deterministic for identical inputs, with stable tie-breaking
- offer expiry uses server-authoritative time
- Recovery can be stopped with workspace/global operational kill switches before broad rollout

### Recovered revenue

Track at least two explicit measures:

- `recoveredBooked` — value attributed when a recovery acceptance successfully creates the recovered booking
- `recoveredRealised` — value realised when that recovered booking completes according to accounting rules

If the recovered booking is later cancelled/no-showed/refunded, the corresponding attribution/revenue state must reverse or transition explicitly. Never expose `recoveredBooked` as unqualified realised revenue.

## Client communication eligibility

Before automated Recovery/Retention outreach, Clients/Notifications must evaluate consent/lawful-basis flags, channel preference, opt-out, quiet hours and frequency caps. These checks are server-side and auditable.

## Public recovery-offer surface

Public offer links are unauthenticated capabilities:

- high-entropy, unguessable, single-use or state-bound tokens
- short server-authoritative expiry
- minimal PII exposure
- strict abuse/rate limits
- GET renders information only
- acceptance is POST (or equivalent state-changing method) behind an explicit user action; link previews/prefetch must never accept an offer

## Payments

Payment and refund lifecycles are separate but linked. A payment may require additional action, authorize/capture, fail, be partially or fully refunded, voided or disputed. Refunds are separate entities and multiple refunds may reference one payment.

Payment commands and provider webhooks require idempotency keys, ordering-safe transition rules and real database integration tests.

## Inventory

Every stock mutation is an append-only movement with an explicit operational reason such as sale, service consumption, supplier delivery, damaged/lost or manual correction. On-hand balance must reconcile to the movement ledger.

## Audit

High-consequence changes emit audit records with actor, workspace, action, entity reference, timestamp and request/trace id. Relevant before/after or reason data is captured where appropriate and safe. Audit storage is append-only by database privilege, not convention alone.

## JSON usage

Use JSON/JSONB for genuinely external or schemaless provider metadata, not as a shortcut for domain schema design.
