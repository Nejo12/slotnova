# Phase 2 Research — Catalog, Scheduling & Booking

Each item: options considered, evidence, recommendation, rejected
alternatives, ADR impact. Items that contradict an accepted ADR are called
out explicitly and none were found to require reopening one.

## R-SCOPE — Resource/staff scope for the protected-resource key

**Question**: What is the "protected resource" ADR-011's exclusion
constraint protects — the whole workspace, a location, or a staff member?

**Options**:
1. Workspace-level single implicit resource (no staff dimension).
2. `resource_id` = staff member, sourced from Identity/a future Staff
   module, referenced-only by Booking/Scheduling.
3. `resource_id` = staff member **and** `location_id`, for multi-location
   workspaces.

**Evidence**: `docs/product-handoff.md` lists Staff as a distinct future
product surface with representative Figma designs (`docs/product-handoff.md`
line ~82), and ADR-012 explicitly reserves staff profile/schedule ownership
for a later Staff phase, while Catalog is only permitted a "staff-service
capability boundary" (issue #3, #56). This implies staff **identities**
exist as a reference target before the Staff phase builds full profile
management, but Phase 2 does not own or build that identity itself.

**Recommendation**: Model `resource_id` as an opaque reference (option 2)
from day one — Scheduling/Booking store and key on it, but Phase 2 does not
build staff profile CRUD. If no staff identity exists yet at implementation
time, fall back to a single synthetic workspace-level resource row so the
schema shape doesn't change later (avoids an expand-contract migration when
Staff ships). Location scope (option 3) is deferred — see R-LOCATION.

**Rejected**: Pure workspace-level-only (option 1) — would require a
breaking schema change the moment multi-staff scheduling is needed, which
issue #3's own acceptance criteria (staff-service capability boundary)
signals is imminent.

**ADR impact**: None — consistent with ADR-012's module boundaries.
**Founder decision required** (`plan.md` Q3) to confirm this is the
intended sequencing rather than staff scope being explicitly out of Phase 2.

## R-LOCATION — Location scope

**Options**: (1) no location dimension in Phase 2, (2) `location_id`
included in the protected-resource key from the start.

**Evidence**: Phase 1's `identity.locations` table already exists
(`specs/001-platform-foundation-shell/data-model.md`) as tenant-owned, so
the column is cheap to reference. No Figma evidence available this session
confirming multi-location booking flows are in Phase 2 scope.

**Recommendation**: Include `location_id` as a nullable reference on
Booking/AvailabilityPattern (defaulting to a workspace's sole/primary
location where only one exists) so the exclusion constraint can key on
`(location_id, resource_id, blocking_range)` without a later migration, but
do not build any multi-location UI/selection flow in Phase 2.

**Rejected**: Omitting the column entirely — would force an expand-contract
migration + backfill the moment multi-location is needed, against
`docs/architecture` migration guidance to plan additive changes.

**ADR impact**: None. **Founder decision required** (Q7) only on whether
multi-location *UI* enters Phase 2 scope, not on the schema shape.

## R-EXCL — Exclusion constraint shape

**Options**:
1. `EXCLUDE USING gist (workspace_id WITH =, resource_id WITH =, blocking_range WITH &&) WHERE (status IN (blocking states))`
2. Same, keyed additionally on `location_id`.
3. Partial unique index instead of exclusion constraint.

**Evidence**: ADR-011 mandates `btree_gist` + an exclusion constraint over
the blocking interval for blocking statuses; a partial unique index cannot
express range-overlap rejection and is explicitly insufficient for this
invariant.

**Recommendation**: Option 2 — `EXCLUDE USING gist (workspace_id WITH =,
location_id WITH =, resource_id WITH =, blocking_range WITH &&) WHERE
(status = ANY (ARRAY['pending','confirmed']))`. `blocking_range` is a
generated `tstzrange` column (`[start, end)` — PostgreSQL's default range
bound is already half-open on the right, matching ADR-010) computed from
`start_at`, `service_duration + pre_buffer + post_buffer`. `Draft` and
`Cancelled`/`Completed` are excluded from the predicate (non-blocking).

**Rejected**: Option 3 (no overlap-rejection semantics); Option 1 without
`location_id` (rejected pending R-LOCATION's answer, but the column is
added regardless per that recommendation, so keeping it in the constraint
now avoids a second migration).

**ADR impact**: None — directly implements ADR-011.

## R-OCC — Optimistic concurrency

**Question**: Does Booking need a version/revision column for edits?

**Evidence**: Reschedule/cancel/complete are concurrent-edit-realistic —
two operators can plausibly open the same booking. Creation is protected by
the exclusion constraint already; edits to non-overlap fields (e.g., notes,
resource reassignment that still passes the exclusion check) are not
caught by that constraint alone.

**Recommendation**: Add an integer `version` column to Booking. Every
mutating command (`reschedule`, `cancel`, `complete`) requires the caller's
last-known `version`; a mismatch returns a `409` `problem+json` with a
`stale-write` type, current version, and the current booking state so the
client can refresh and retry. Do not introduce event sourcing or a generic
optimistic-concurrency framework — this is a single `WHERE version = $n`
guard on `UPDATE`.

**Rejected**: No version column (silent last-write-wins — violates
constitution II); full event-sourcing (violates constitution VI, no
demonstrated need).

**ADR impact**: None — consistent with "optimistic concurrency where
editing races are plausible" in issue #3/#56.

## R-CAL — Calendar composition strategy

**Options**:
1. Frontend composes Calendar entirely from existing Scheduling
   availability + Booking list/detail endpoints (two client-side fetches,
   merged in a query hook).
2. A thin backend read-composition endpoint
   (`GET /calendar/:resourceId?from&to`) that internally calls the
   Scheduling and Booking application services and returns a merged view
   model, still with no Calendar persistence.

**Evidence**: ADR-012 forbids Calendar as a backend *bounded context* (no
persistence, no ownership) but does not forbid a thin read-composition
endpoint; Phase 1's API/contracts pipeline already supports adding a
narrowly-scoped endpoint. Two separate client fetches risk visible
loading-state flicker (availability resolves, then bookings resolve, or
vice versa) which conflicts with the "no critical information exists only
in animation"/layout-stability guidance in `docs/standards/motion.md` if
handled naively.

**Recommendation**: Option 2 — one composition endpoint per module
boundary rule (constitution III: cross-module access via explicit
application ports, not ad hoc frontend fan-out logic reinventing merge
rules). The endpoint lives in a thin `apps/api/src/modules/calendar-read`
(or equivalent) directory that has **no table migrations**, only an
application service composing Scheduling + Booking ports. This keeps a
single loading/error/empty state on the frontend and satisfies FR-030–032.

**Rejected**: Option 1 — pushes overlap/merge logic into the frontend,
duplicated per client, and produces harder-to-test composite loading
states.

**ADR impact**: None — a read-composition service is not a bounded
context/owned schema, consistent with ADR-012.

## R-CAT — Minimal category model

**Options**: (1) no category concept in Phase 2, (2) a simple
`service_categories` table with `name` + `sort_order`, (3) a richer
category model with descriptions/icons/nested categories.

**Evidence**: No Figma access this session to confirm whether category
grouping appears in `06`/`07`. Issue #56 lists "categories where justified"
as conditional, not mandatory.

**Recommendation**: Option 2, and only if a workspace's service list would
otherwise be unusably flat — implemented as an optional foreign key on
Service, not a required one. If `speckit-clarify`/Founder review of Figma
later shows no category UI, this table is trivially unused/removable
before Phase 2 implementation starts (additive, no migration cost yet
since nothing is built).

**Rejected**: Option 3 — no evidence justifies nested/rich categories;
violates constitution VI (rule of three, no speculative modeling).

**ADR impact**: None. **Recommended default, not Founder-blocking** (Q6).

## R-ADDON — Minimal add-on model

**Options**: (1) no add-ons in Phase 2, (2) a narrow `service_add_ons`
table with a `price_delta_minor` and `duration_delta_minutes`, each
independently nullable (so an add-on can affect price only, duration only,
both, or — if both are null — function as a non-modifying informational
add-on), (3) a generic modifier/discount engine.

**Evidence**: Issue #3 does not require add-ons for its acceptance
criteria (service selection, not add-on selection, is listed). Issue #56
says "add-ons only to the degree Phase 2 booking requires them."

**Recommendation**: Option 1 for Phase 2 MVP — do not build add-ons unless
Figma review (once accessible) shows the booking flow requires add-on
selection to satisfy a P1 user story. If later needed, option 2's shape
(two independent nullable deltas) directly answers "price/duration/both/
neither" without a generic commerce engine.

**Rejected**: Option 3 — explicitly against constitution VI and AGENTS.md's
prohibition on generic dumping-ground abstractions without demonstrated
need.

**ADR impact**: None. **Recommended default, not Founder-blocking** (Q5).

## R-IDS — Public/internal booking identifiers

**Options**: (1) expose the internal UUID primary key directly in the API,
(2) a separate short public-facing booking reference distinct from the
internal id.

**Evidence**: No Phase-2 requirement (client-facing lookup by human-typed
reference, printed confirmation, etc.) was found in `docs/product-handoff.md`
or issue #3/#56 that would justify a second identifier scheme. Phase 1's
platform entities (`specs/001-platform-foundation-shell/data-model.md`) use
opaque branded UUIDs throughout with no separate public reference.

**Recommendation**: Option 1 — reuse the Phase-1 convention (opaque branded
`BookingId`, `ServiceId`, `AvailabilityPatternId`, etc.), consistent with
existing entities and constitution VI (no speculative abstraction).
Revisit only if a future phase (e.g., Recovery's public offer surface,
ADR-018) demonstrates a real need for a separate public reference on
Booking specifically.

**Rejected**: Option 2 — no demonstrated need yet.

**ADR impact**: None.

## R-DST — DST repeated-hour resolution rule

**Question**: ADR-010 mandates DST-safe recurrence but does not itself
pick the tie-break for the repeated local hour (autumn "fall back").

**Options**: (1) always resolve to the first occurrence (earlier UTC
instant), (2) always resolve to the second occurrence (later UTC instant),
(3) reject/require explicit disambiguation.

**Evidence**: Temporal's `PlainDateTime.toZonedDateTime` with
`disambiguation: 'earlier'`/`'later'`/`'reject'` options directly implements
options 1/2/3 without custom logic, per `@js-temporal/polyfill` (already
the accepted library, ADR-010).

**Recommendation**: Option 1 (`disambiguation: 'earlier'`) for recurring
availability expansion — deterministic, no user-facing prompt needed for a
recurring *pattern* (as opposed to a one-off booking time picked directly
against a resolved instant, which is never ambiguous because the UI offers
concrete instants, not local wall-time strings). Document this as the
canonical rule so no second implementation invents a different tie-break.

**Rejected**: Option 3 for recurring pattern expansion — would require
surfacing a disambiguation UI for a background recurrence calculation with
no natural moment to ask; acceptable only if evidence later shows a
Figma-specified prompt for this exact case, which was not found.

**ADR impact**: None — this is an application of ADR-010's Temporal
decision, not a new decision.

## Reconciliations & flagged discrepancies (feed `/speckit-analyze`)

- Issue #56 refers to `docs/adr/012-domain-module-mesting/strategy.md`
  (likely a transcription artifact); the actual accepted file is
  `docs/adr/012-domain-module-map.md`. This research and `data-model.md`
  cite the correct filename.
- No contradiction found between issue #3, issue #56, the constitution, and
  ADR-010/011/012 — all open items above are underspecification (missing
  product detail), not conflicting sources.
