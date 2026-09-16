# Phase 2 Research — Catalog, Scheduling & Booking

Each item: options considered, evidence, recommendation, rejected
alternatives, ADR impact. Items marked **[Founder-resolved]** below reflect
an explicit Founder decision made during review of the first planning
draft, superseding this document's original recommendation on that point;
the original options/evidence are kept for the record, with the
disposition updated.

## R-SCOPE — Resource/staff scope for the protected-resource key [Founder-resolved]

**Question**: What is the "protected resource" ADR-011's exclusion
constraint protects — the whole workspace, a location, or a staff member?

**Original options considered**: (1) workspace-level single implicit
resource, (2) `resource_id` = staff member referenced-only from a future
Staff module, (3) `resource_id` = staff member + `location_id`.

**Original evidence**: `docs/product-handoff.md` lists Staff as a distinct
future product surface, and ADR-012 reserves staff profile/schedule
ownership for a later Staff phase, while Catalog is only permitted a
"staff-service capability boundary." The first draft read this as implying
staff identities already exist as a reference target.

**Founder correction**: No concrete staff identity source exists on current
`main` (confirmed by inspection — see `R-CLIENTS` for the equivalent
Clients-side check, and the identity module inventory in `data-model.md`).
Inventing a synthetic staff identity or a `staff_service_capabilities` table
keyed against nothing real would smuggle Staff-phase modeling into Phase 2.
The Founder decided: **Phase 2 uses a single implicit workspace-level
blocking resource.** No staff profile rows, synthetic staff identities,
staff CRUD, or multi-staff scheduling behavior. The staff-service capability
requirement from issue #3/#56 is bounded as a documented future
Catalog↔Staff **application-port integration point** (ADR-012), not a
persisted Phase-2 table.

**Disposition**: `workspace_id` alone is the protected-resource key
(`R-EXCL`). No `resource_id` column exists on `bookings` or
`availability_patterns` in Phase 2.

**ADR impact**: None — consistent with ADR-012's module boundaries; this
correction makes the plan *more* conservative about not pulling the Staff
phase forward, not less.

## R-LOCATION — Location scope [Founder-resolved]

**Original options**: (1) no location dimension, (2) nullable `location_id`
added speculatively to avoid a future migration.

**Founder correction**: Adding a speculative nullable column "to avoid a
future migration" is itself the kind of premature abstraction constitution
VI prohibits — a future additive migration is the correct tool when a real
multi-location requirement exists, and Phase 1's migration tooling already
supports additive/expand-contract changes safely. The Founder decided:
**multi-location Scheduling/Booking is deferred entirely; no `location_id`
column is added in Phase 2**, speculative or otherwise.

**Disposition**: No `location_id` anywhere in the Phase-2 schema. The
exclusion constraint does not depend on location.

**ADR impact**: None.

## R-EXCL — Exclusion constraint shape [Founder-resolved]

**Options considered**: (1) `EXCLUDE USING gist (workspace_id WITH =,
blocking_range WITH &&) WHERE (status = 'confirmed')`, (2) the same with an
added `resource_id WITH =` component, (3) the same with an added
`location_id WITH =` component, (4) a partial unique index instead of an
exclusion constraint.

**Evidence**: ADR-011 mandates `btree_gist` + an exclusion constraint over
the blocking interval for blocking statuses; a partial unique index cannot
express range-overlap rejection and is explicitly insufficient (rules out
option 4). With R-SCOPE and R-LOCATION both resolving to "no resource/
location dimension in Phase 2," `workspace_id` is not merely *a* candidate
key component — it is the *only* dimension Phase 2 actually models, because
a workspace has exactly one implicit bookable resource and no location
scope. Adding a `resource_id` or `location_id` column to the constraint
when neither column exists on the table would be meaningless.

**Why not a dedicated workspace-resource id instead of reusing
`workspace_id` directly**: A separate `resource_id` column that always
holds a single synthetic per-workspace value would be pure indirection —
it could never take a second distinct value in Phase 2, so it carries no
information `workspace_id` doesn't already carry, and it invites exactly
the "unreachable enum value/speculative column" pattern the Founder just
rejected for `location_id` and `staff_service_capabilities`. The simplest
truthful invariant uses the column that already exists and already
uniquely identifies the protected resource: `workspace_id`.

**Recommendation (final)**: Option 1 —

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE booking.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    workspace_id WITH =,
    blocking_range WITH &&
  ) WHERE (status = 'confirmed');
```

`blocking_range` is a generated `tstzrange` column (`[start, end)` —
PostgreSQL's default range bound is already half-open on the right,
matching ADR-010) computed from `start_at` and
`service_duration + pre_buffer + post_buffer`. Only `confirmed` bookings
are blocking in the Founder-corrected model (`Cancelled`/`Completed` are
terminal and non-blocking; there is no persisted `draft`/`pending` state to
exclude from the predicate because those states no longer exist — see
`R-*` below and `data-model.md`).

**Rejected**: Options 2/3 (no `resource_id`/`location_id` column exists to
key on); option 4 (insufficient semantics).

**ADR impact**: None — directly implements ADR-011 with the smallest
truthful key for the Founder-approved Phase-2 model. If a future phase adds
`resource_id`/`location_id` columns, the constraint is dropped and
recreated with the added component(s) as part of that phase's own additive
migration — not pre-declared here.

## R-OCC — Optimistic concurrency

**Question**: Does Booking need a version/revision column for edits?

**Evidence**: Reschedule/cancel/complete are concurrent-edit-realistic —
two operators can plausibly open the same booking. Creation is protected by
the exclusion constraint already; edits to non-overlap fields are not
caught by that constraint alone. This item is unaffected by the Founder's
Draft/resource/location/Clients decisions.

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

**ADR impact**: None.

## R-CAL — Calendar composition strategy

**Options**:
1. Frontend composes Calendar entirely from existing Scheduling
   availability + Booking list/detail endpoints (two client-side fetches,
   merged in a query hook).
2. A thin backend read-composition endpoint (`GET /calendar?from&to` — no
   `resourceId` query param now that the resource is workspace-implicit)
   that internally calls the Scheduling and Booking application services
   and returns a merged view model, still with no Calendar persistence.

**Evidence**: ADR-012 forbids Calendar as a backend *bounded context* (no
persistence, no ownership) but does not forbid a thin read-composition
endpoint; Phase 1's API/contracts pipeline already supports adding a
narrowly-scoped endpoint. Two separate client fetches risk visible
loading-state flicker, conflicting with the layout-stability guidance in
`docs/standards/motion.md` if handled naively.

**Recommendation**: Option 2 — one composition endpoint per module
boundary rule (constitution III). The endpoint lives in a thin
`apps/api/src/modules/calendar-read` (or equivalent) directory with **no
table migrations**, only an application service composing Scheduling +
Booking ports. This keeps a single loading/error/empty state on the
frontend and satisfies FR-030–032. The endpoint's request shape drops the
`resourceId` parameter from the first draft since the resource is now
workspace-implicit, not selectable.

**Rejected**: Option 1 — pushes overlap/merge logic into the frontend,
duplicated per client, and produces harder-to-test composite loading
states.

**ADR impact**: None.

## R-CAT — Minimal category model [Founder-finalized, non-blocking]

**Options**: (1) no category concept, (2) a simple `service_categories`
table with `name` + `sort_order`, (3) a richer category model with
descriptions/icons/nested categories.

**Founder disposition**: Option 2 accepted as final for Phase 2. No
nesting, icons, taxonomy framework, or rich category abstraction.

**Rejected**: Option 1 (workspaces with many services would have an
unusably flat list); Option 3 (no evidence justifies it; violates
constitution VI).

**ADR impact**: None.

## R-ADDON — Minimal add-on model [Founder-finalized, non-blocking]

**Options**: (1) no add-ons in Phase 2, (2) a narrow `service_add_ons`
table with independently nullable `price_delta_minor` and
`duration_delta_minutes`, (3) a generic modifier/discount engine.

**Founder disposition**: Option 1 (defer entirely) accepted as final for
Phase 2 — add-ons are not implemented unless concrete Figma/product
evidence later proves they are necessary for the Phase-2 booking MVP. If
that evidence emerges, option 2's shape (recorded here for that future
occasion) directly answers "price/duration/both/neither" without a generic
commerce engine — it is not built now.

**Rejected**: Option 3 — explicitly against constitution VI and AGENTS.md's
prohibition on generic dumping-ground abstractions without demonstrated
need.

**ADR impact**: None.

## R-IDS — Public/internal booking identifiers

**Options**: (1) expose the internal UUID primary key directly in the API,
(2) a separate short public-facing booking reference distinct from the
internal id.

**Evidence**: No Phase-2 requirement was found in `docs/product-handoff.md`
or issue #3/#56 justifying a second identifier scheme. Phase 1's platform
entities use opaque branded UUIDs throughout with no separate public
reference. Unaffected by the Founder's other decisions.

**Recommendation**: Option 1 — reuse the Phase-1 convention (opaque branded
`BookingId`, `ServiceId`, `AvailabilityPatternId`, etc.), consistent with
existing entities and constitution VI.

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
the accepted library, ADR-010). Unaffected by the Founder's other
decisions.

**Recommendation**: Option 1 (`disambiguation: 'earlier'`) for recurring
availability expansion — deterministic, no user-facing prompt needed.

**Rejected**: Option 3 for recurring pattern expansion — no natural moment
to surface a disambiguation prompt for a background recurrence calculation.

**ADR impact**: None — this is an application of ADR-010's Temporal
decision, not a new decision.

## R-CLIENTS — Booking's dependency on a customer/client identity [new, Founder-resolved]

**Question raised by independent review**: The first planning draft
modeled `Booking.client_id` as a reference to a "Clients-owned identity,"
but Clients is scheduled for Phase 3 (`docs/implementation-plan.md`
Phase 3 — "Clients, Notifications & Messaging") and issue #3 does not list
a Clients entity as Phase-2 scope. This is a real sequencing gap: Phase 2
cannot honestly reference an entity that does not yet exist.

**Investigation performed**: Inspected `apps/api/src/modules/` on current
`main` for any existing canonical customer/client identity. Only three
modules exist: `identity` (users, workspaces, locations, memberships,
invitations, sessions — all operator/staff-side tenancy records, per
`specs/001-platform-foundation-shell/data-model.md`), `platform` (outbox/
scheduler), and `audit`. **No customer/client entity exists anywhere on
current `main`.**

**Options considered**: (1) reinterpret `identity.users` or workspace
memberships as customer records, (2) reinterpret a future staff identity as
a stand-in, (3) add a booking-local customer/contact/profile table or
inline snapshot as a Phase-2 workaround, (4) omit `client_id` entirely from
Phase-2 Booking and let Phase 3 add the association additively.

**Evidence against options 1–3**: `identity.users` are authenticated
operators/staff with workspace memberships and roles (ADR-007/008/009) —
conflating them with customers would corrupt the authorization and
tenancy model (a customer is not a workspace member). A booking-local
customer/contact snapshot table (option 3) is exactly the kind of
Phase-3-implementation-smuggled-into-Phase-2 the Founder's review flagged;
it would also need its own RLS/validation/lifecycle treatment that
duplicates work Phase 3 is explicitly scoped to do properly.

**Founder decision**: Option 4. **Phase-2 Booking does not persist a
`client_id` or any customer/contact/profile reference.** Phase 2 Booking is
fully valid, creatable, and usable without a Clients-domain dependency.
Phase 3 adds the Booking↔Client association through an **additive
migration** (a new nullable `client_id` column plus an application-port
integration to the Phase-3 Clients module) once that module exists — this
is a forward-compatible, zero-cost deferral, not a design debt, because
adding a nullable foreign-key-shaped column to an existing table is exactly
the kind of expand-step migration this repository's migration discipline
already supports.

**Consequence for UI/contracts**: The authoritative Phase-2 booking flow
does not require a client-selection step (`spec.md` User Story 3,
Acceptance Scenario 5). If Figma evidence is later obtained showing a
client-selection UI in `06`/`07`/`18`, it is labeled future/Phase-3
integration in this spec, not implemented as Phase-2 scope.

**ADR impact**: None — this is a scope-sequencing correction, not an
architecture decision. It reinforces ADR-012's module-boundary discipline
(no cross-module ownership grab) rather than conflicting with it.

## Reconciliations & flagged discrepancies (feed `/speckit-analyze`)

- Issue #56 refers to `docs/adr/012-domain-module-mesting/strategy.md`
  (likely a transcription artifact); the actual accepted file is
  `docs/adr/012-domain-module-map.md`. This research and `data-model.md`
  cite the correct filename.
- The first planning draft's `Booking.client_id` and
  `staff_service_capabilities`/`resource_id`/`location_id` modeling was
  **evidence-unsupported speculation**, not a conflict between authoritative
  sources — corrected in this revision per Founder decision. No
  contradiction exists between issue #3, issue #56, the constitution, and
  ADR-010/011/012; the corrected model is a strict subset of what those
  sources actually require.
