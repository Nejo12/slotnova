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
  range, bounded by the same expansion horizon as
  `scheduling.contract.md`'s resolve endpoint.
- Failures:
  - `403` `problem+json` — permission-restricted state (FR-032); the
    frontend renders this distinctly from empty/error.
  - `422` — range exceeds horizon.
  - `502`/`503`-mapped `problem+json` if either underlying application
    service call fails — the frontend renders an explicit error+retry
    state, distinguishable from "no bookings" empty state.

No booking or availability data is persisted by this endpoint; it
composes existing Scheduling/Booking application services and returns a
read-only view. No client-selection or client data appears anywhere in
this response (`research.md` R-CLIENTS).
