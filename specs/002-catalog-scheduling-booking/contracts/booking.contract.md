# Booking Contract

Founder review note: `resourceId`, `locationId`, and `clientId` are removed
from all request/response shapes below (`research.md` R-SCOPE, R-LOCATION,
R-CLIENTS). Creation lands directly at `confirmed` — there is no `Pending`
creation path and no `/confirm` endpoint in Phase 2.

## `GET /bookings?from=&to=&status=`

- Auth: session + workspace. Capability: `booking:read`.
- Response `200`: `Booking[]` (summary shape).

## `GET /bookings/:id`

- Auth/capability: `booking:read`.
- Response `200`: `Booking` detail including `version`.
- Failures: `404` `problem+json` (not found or cross-workspace).

## `POST /bookings`

- Auth: session + workspace. Capability: `booking:create`.
- Input: `{ serviceId, startsAt }` (duration/buffers snapshotted
  server-side from the current Service; no `resourceId` — the workspace is
  the implicit resource; no `clientId` — no client entity exists in
  Phase 2, `research.md` R-CLIENTS).
- Idempotency: required `Idempotency-Key` header; a retried identical
  request returns the original booking rather than a duplicate or a
  spurious overlap conflict against itself.
- Response `201`: created `Booking` at `confirmed` (direct creation — no
  intermediate `pending`/`draft` row, Founder decisions 1 & 2).
- Failures:
  - `422` `problem+json` — invalid input (duration mismatch, inactive
    service, malformed range).
  - `409` `problem+json` type `booking-overlap` — the database exclusion
    constraint rejected the write; response includes the conflicting time
    context needed for the client to offer "try another slot."
  - `403` — missing capability.

## `POST /bookings/:id/reschedule`

- Auth/capability: `booking:edit`.
- Input: `{ version, startsAt }`.
- Response `200`: updated `Booking` with new `blocking_range`.
- Failures: `409` `stale-write`, `409` `booking-overlap` (new range
  conflicts), `422` if source status does not permit reschedule (only
  `confirmed` bookings can be rescheduled).

## `POST /bookings/:id/cancel`

- Auth/capability: `booking:cancel`.
- Input: `{ version, reason? }`.
- Response `200`: updated `Booking` at `cancelled`.
- Failures: `409` `stale-write`, `409` `invalid-transition` (already
  `completed`).
- Idempotent: cancelling an already-`cancelled` booking with a matching
  version returns `200` with the current state (no-op), not an error.

## `POST /bookings/:id/complete`

- Auth/capability: `booking:complete`.
- Input: `{ version }`.
- Response `200`: updated `Booking` at `completed`.
- Failures: `409` `stale-write`, `409` `invalid-transition` (source not
  `confirmed`).

## Not part of Phase 2

- **`POST /bookings/:id/confirm`** does not exist — there is no `pending`
  state to confirm from. If a future phase introduces an approval-required
  creation path (a real `Pending` producer), this endpoint is added then,
  with its own additive migration and state-machine entry.

## Problem+json conflict types used above

| `type` | Meaning | HTTP status |
|---|---|---|
| `.../problems/booking-overlap` | DB exclusion constraint rejected the write | 409 |
| `.../problems/stale-write` | `version` did not match current row | 409 |
| `.../problems/invalid-transition` | command not valid from current state | 409 |
| `.../problems/validation` | request shape/invariant failure | 422 |
