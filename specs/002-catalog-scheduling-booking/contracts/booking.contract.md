# Booking Contract

## `GET /bookings?resourceId=&from=&to=&status=`

- Auth: session + workspace. Capability: `booking:read`.
- Response `200`: `Booking[]` (summary shape).

## `GET /bookings/:id`

- Auth/capability: `booking:read`.
- Response `200`: `Booking` detail including `version`.
- Failures: `404` `problem+json` (not found or cross-workspace).

## `POST /bookings`

- Auth: session + workspace. Capability: `booking:create`.
- Input: `{ resourceId, locationId?, serviceId, clientId, startsAt }`
  (duration/buffers snapshotted server-side from the current Service).
- Idempotency: required `Idempotency-Key` header; a retried identical
  request returns the original booking rather than a duplicate or a
  spurious overlap conflict against itself.
- Response `201`: created `Booking` at `pending` or `confirmed` per Q2's
  resolution.
- Failures:
  - `422` `problem+json` — invalid input (duration mismatch, inactive
    service, malformed range).
  - `409` `problem+json` type `booking-overlap` — the database exclusion
    constraint rejected the write; response includes the conflicting
    resource/time context needed for the client to offer "try another
    slot," not the other booking's private detail beyond what the actor is
    already authorized to see.
  - `403` — missing capability.

## `POST /bookings/:id/confirm`

- Auth/capability: `booking:edit`.
- Input: `{ version }`.
- Response `200`: updated `Booking`.
- Failures: `409` type `stale-write` (version mismatch), `409` type
  `invalid-transition` (source not `pending`).

## `POST /bookings/:id/reschedule`

- Auth/capability: `booking:edit`.
- Input: `{ version, startsAt, resourceId? }`.
- Response `200`: updated `Booking` with new `blocking_range`.
- Failures: `409` `stale-write`, `409` `booking-overlap` (new range
  conflicts), `422` if source status does not permit reschedule.

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

## Problem+json conflict types used above

| `type` | Meaning | HTTP status |
|---|---|---|
| `.../problems/booking-overlap` | DB exclusion constraint rejected the write | 409 |
| `.../problems/stale-write` | `version` did not match current row | 409 |
| `.../problems/invalid-transition` | command not valid from current state | 409 |
| `.../problems/validation` | request shape/invariant failure | 422 |
