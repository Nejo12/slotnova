# Calendar Contract (read-composition only — `research.md` R-CAL)

Calendar is not a backend bounded context (ADR-012). This is the single
thin composition endpoint recommended in `research.md` R-CAL to avoid
duplicating merge logic per frontend client and to give the UI one
loading/error/empty state instead of two uncoordinated fetches.

Founder review note: no `resourceId` parameter — the resource is
workspace-implicit (`research.md` R-SCOPE).

## `GET /calendar?from=&to=`

- Auth: session + workspace. Capability: `booking:read` **and**
  `scheduling:read` (a user must be authorized to see both underlying
  surfaces; the endpoint does not grant new access).
- Response `200`: a merged view model — open intervals (from Scheduling's
  resolve) and occupied intervals with booking summaries (from Booking's
  list) for the workspace's implicit resource over the requested date
  range. Calendar preserves Scheduling's 370-day expansion safety cap.
  Because Calendar widens the local-date expansion window by one day on
  each side before clipping the result back to the caller's requested
  half-open interval, the largest accepted caller-visible Calendar window
  is 368 days. Larger windows are rejected rather than silently clamped.
- Failures:
  - `403` `problem+json` — permission-restricted state (FR-032); the
    frontend renders this distinctly from empty/error.
  - `422` — range exceeds the Calendar limit above (and therefore would
    exceed Scheduling's 370-day expanded local-date safety cap), or the
    requested range is otherwise invalid.
  - `500` `internal` `problem+json` if either in-process underlying
    application-service read fails. The response is never partial Calendar
    data; the frontend renders an explicit error+retry state, distinguishable
    from "no bookings" empty state. `502`/`503` gateway semantics are not
    used for these modular-monolith application ports.

No booking or availability data is persisted by this endpoint; it
composes existing Scheduling/Booking application services and returns a
read-only view. No client-selection or client data appears anywhere in
this response (`research.md` R-CLIENTS).
