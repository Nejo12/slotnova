# Domain Modeling Conventions

## Tenant boundary

Slotnova is multi-tenant from the beginning.

Core ownership model:

```text
Workspace
  └─ Location
       └─ operational records

User
  └─ Membership(workspaceId, role, permissions)
```

Tenant-owned records must carry an explicit `workspaceId`; location-scoped records also carry `locationId` where appropriate. Cross-workspace access is forbidden by default.

## Identity types

Use opaque/branded identifiers for high-value domain IDs rather than raw interchangeable strings.

Examples: `BookingId`, `ClientId`, `WorkspaceId`, `RecoveryOfferId`.

## Time model

Do not use one undifferentiated JavaScript `Date` concept everywhere. Model at least:

- Instant: exact UTC point in time
- LocalDate: calendar date without time
- LocalTime: wall-clock time without date
- IANA TimeZone: e.g. `Europe/Berlin`
- Duration

Bookings must preserve the timezone context required to interpret business scheduling correctly. DST transitions require dedicated tests.

## Money model

Never store or calculate money using binary floating point.

Use an explicit Money value object or equivalent representation:

```text
amountMinor: integer
currency: ISO-4217 code
```

Discounts, tips, tax, price overrides, refunds and recovered-revenue attribution must be deterministic and tested.

## Booking lifecycle

Canonical lifecycle:

```text
Draft → Review → Created/Pending → Confirmed → Completed
                              ↘ Cancelled
                              ↘ No-show
```

Recovery is associated with a vacancy created by cancellation/no-show/unfilled capacity; it is not a booking status.

## Recovery lifecycle

```text
Vacancy
→ value at risk
→ candidate ranking
→ offer(s)
→ waiting
→ first valid acceptance
→ close competing offers
→ update/create booking
→ calendar/client history update
→ recovered-revenue attribution
```

Required invariants:

- first valid acceptance wins
- competing offers close deterministically
- recovery completion is idempotent
- recovered revenue cannot be counted twice
- calendar/client-history side effects occur only after the booking transition succeeds

## Inventory model

Every stock mutation records an explicit operational reason, such as sale, service consumption, supplier delivery, damaged/lost or manual correction.

## Audit model

High-consequence changes emit audit records with actor, workspace, action, entity reference, timestamp and request/trace identifier. Relevant before/after information is captured where appropriate and safe.

## JSON usage

Use JSON/JSONB for genuinely external or schemaless provider metadata, not as a shortcut for domain schema design.
