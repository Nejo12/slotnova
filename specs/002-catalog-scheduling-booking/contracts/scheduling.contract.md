# Scheduling Contract

Scheduling exposes availability *input* (patterns/exceptions) and a
*query* boundary; it does not expose Booking data.

Founder review note: all endpoints below are workspace-scoped only — no
`resourceId` or `locationId` parameter exists in Phase 2 (`research.md`
R-SCOPE, R-LOCATION). A workspace has exactly one implicit availability
pattern set.

## `GET /scheduling/availability-patterns`

- Auth: session + workspace. Capability: `scheduling:read`.
- Response `200`: `AvailabilityPattern[]` for the workspace (in practice at
  most the workspace's single active pattern set, but returned as a list
  to allow effective-dated pattern history without a breaking shape
  change).

## `POST /scheduling/availability-patterns`

- Auth/capability: `scheduling:manage`.
- Input: `{ timezone (IANA), weeklyRule, effectiveFrom?, effectiveUntil? }`.
- Response `201`: created pattern.
- Failures: `422` if `weeklyRule` intervals overlap within a day or
  `timezone` is not a valid IANA id.

## `POST /scheduling/availability-exceptions`

- Auth/capability: `scheduling:manage`.
- Input: `{ startsAt, endsAt, reason? }` — always resolved instants, never
  a recurring rule (FR-012).
- Response `201`: created exception.
- Failures: `422` if `startsAt >= endsAt`.

## `POST /scheduling/availability/resolve`

State-changing-looking but actually a pure computation over existing
input data with no persistence side effect; still `POST` (not `GET`)
because the request body (date range + expansion horizon) exceeds
comfortable query-string encoding and to leave room for future computation
cost controls — documented exception, not a violation of the no-GET-for-
mutation rule (this endpoint mutates nothing).

- Auth: session + workspace. Capability: `scheduling:read`.
- Input: `{ from, to }` (bounded by the documented expansion horizon,
  `research.md`/`data-model.md`).
- Response `200`: resolved open intervals (`[start,end)` UTC instants)
  after applying exceptions to the recurring pattern, within the requested
  range and horizon.
- Failures: `422` if the requested range exceeds the expansion horizon.

This endpoint is what the Calendar composition endpoint calls internally
(`calendar.contract.md`); it is not itself Booking-aware.
