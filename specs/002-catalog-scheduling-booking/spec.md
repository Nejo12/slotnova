# Feature Specification: Phase 2 — Catalog, Scheduling & Booking

Status: Draft — planning gate for issue #56, parent #3
Authority order: constitution → accepted ADRs → `docs/product-handoff.md` → this spec/plan/tasks → tests

## Overview

Phase 2 implements the first product-invariant-bearing domains on top of the
Phase 1 platform foundation: **Catalog** (service definitions), **Scheduling**
(availability/interval algebra), and **Booking** (the appointment aggregate
and its lifecycle), plus **Calendar** as a read/composition surface over the
other two. This spec produces the authoritative behavioral contract; no
product implementation code ships under this planning PR.

## Evidence basis

- Accepted ADRs: 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 024
  (see `research.md` for how each constrains this feature)
- `docs/product-handoff.md` — Booking lifecycle, mobile IA, cross-product
  interaction rules
- `docs/architecture/event-catalogue.md` — outbox record shape and
  versioning policy
- Founder review of the first planning draft (this revision), resolving the
  Draft/Confirmed, resource/staff scope, location scope, and Clients
  sequencing questions raised in that draft
- Figma pages `06 — Calendar`, `07 — Booking`, `18 — Prototypes`,
  `19 — Implementation Handoff`: **not accessible in this planning session**
  (see `## Figma access` below). All UI-flow detail below is sourced from
  `docs/product-handoff.md` plus the Founder decisions in this section;
  anything not covered there is recorded as an open question rather than
  invented.

## Figma access

Per the AGENTS.md/CLAUDE.md Figma caveat, this session's Figma tooling
exposed authentication scaffolding only and could not retrieve node content
for `06 — Calendar`, `07 — Booking`, `18 — Prototypes`, or
`19 — Implementation Handoff`. This is recorded as a **visual-access
limitation**, not evidence that the design is absent. Every interaction
requirement below is labeled as one of:

- **[Handoff]** — sourced from `docs/product-handoff.md` (committed, authoritative)
- **[ADR]** — sourced from an accepted ADR
- **[Founder]** — resolved by explicit Founder decision in this revision
- **[Inference]** — planning inference, not yet confirmed against Figma or an
  explicit product decision; listed in `## Open Product Questions`
- **[Open]** — unresolved, requires Figma access or a Founder decision before
  implementation

## Clarifications

### Session 2026-09-16

No live clarification session was run against a human stakeholder in this
planning pass (no `speckit-clarify` interactive session available for a
docs-only planning task with no reachable Figma detail). Ambiguities that
would normally be resolved by clarification were instead recorded in the
first revision's Open Product Questions.

### Session 2026-09-16 (Founder review)

The Founder resolved four of the original open questions directly, and
independent review during this same pass surfaced a fifth issue (the
Clients sequencing gap) that the Founder also resolved. Resolutions:

1. **Draft/Review are not persisted.** `Draft` is client/UI flow state only;
   `Review` is a UI check-answers step. No Booking row exists until final
   creation, and no capacity is held before then.
2. **Operator-created Bookings are created directly `Confirmed`.** Phase 2
   does not implement a `Pending`-producing creation flow. The
   product-handoff phrase `Draft → Review → Pending/Confirmed → Completed`
   is product lifecycle vocabulary, not a mandate that every listed state
   needs a Phase-2 producer; `Pending` is documented as a future lifecycle
   extension point, not persisted as a reachable enum value in Phase 2.
3. **Resource scope is a single implicit workspace-level bookable
   resource.** Phase 2 does not create staff profile rows, synthetic staff
   identities, staff CRUD, or multi-staff scheduling. The staff-service
   capability concept is bounded as a documented future
   integration/application port (ADR-012), not a persisted Phase-2 table,
   because no concrete staff identity source exists on current `main` to
   truthfully key it against.
4. **Location scope is deferred entirely.** No nullable `location_id` is
   added speculatively; the exclusion constraint does not depend on
   location. Multi-location support is a future additive migration when a
   real product requirement exists.
5. **Clients sequencing gap (independent-review finding, Founder-resolved).**
   Phase 2 Booking cannot reference a `client_id` because no customer/client
   identity entity exists on current `main` — `identity.users`,
   `identity.memberships`, and any future staff identity are operator/staff
   records, not customer records, and are not reinterpreted as one. Phase 2
   Booking is valid without a Clients-domain dependency. Phase 3 adds the
   Booking↔Client association via an additive migration/application-port
   integration, not Phase 2.

These are Founder decisions, not planning inferences, and are reflected
throughout `plan.md`, `research.md`, `data-model.md`, `contracts/`, and
`tasks.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator defines a bookable service (Priority: P1)

An operator with Catalog-management capability creates a service (name,
duration, price, optional pre/post buffer, optional category) so that it can
be offered for booking. [Handoff: Catalog scope from issue #3; ADR-012 module
map]

**Why this priority**: Nothing else in Phase 2 is testable without at least
one bookable service.

**Independent test**: Create a service via the Catalog API, confirm it is
`active`, confirm it is scoped to the creating workspace only.

**Acceptance Scenarios**:

1. **Given** an authenticated operator with Catalog-management capability,
   **When** they submit a valid service (name, duration ≥ 1 minute, price in
   minor units + ISO currency), **Then** the service is created `active` and
   visible in that workspace's service list only.
2. **Given** an existing service, **When** an operator deactivates it,
   **Then** it can no longer be selected for new bookings but existing
   bookings referencing it are unaffected.
3. **Given** a user without Catalog-management capability, **When** they
   attempt to create/update a service, **Then** the API returns 403 and no
   UI-only check is relied upon [ADR-009].

---

### User Story 2 - Operator defines recurring availability (Priority: P1)

An operator (or a capability-holding staff member) defines a recurring
weekly working pattern and optional time-off exceptions for the workspace's
single implicit bookable resource, so Scheduling can compute open/blocked
intervals. [ADR-010; Founder: single implicit workspace-level resource]

**Why this priority**: Booking cannot compute a valid slot without a
resolved availability model.

**Independent test**: Define a Mon–Fri 09:00–17:00 pattern in a specific IANA
timezone, add one time-off exception, and query resolved availability for a
date range spanning a DST transition; confirm correct UTC instants without
touching Booking.

**Acceptance Scenarios**:

1. **Given** a recurring weekly pattern in timezone `Europe/London`,
   **When** availability is resolved across the spring-forward DST boundary,
   **Then** the non-existent local hour produces no phantom interval
   [ADR-010].
2. **Given** the same pattern across the autumn-back boundary, **When**
   availability is resolved, **Then** the repeated local hour resolves to a
   single, unambiguous, explicitly-defined instant range (see `research.md`
   R-DST for the resolution rule) rather than a duplicated or doubled-length
   interval.
3. **Given** a time-off exception overlapping part of a recurring working
   interval, **When** availability is resolved, **Then** the exception
   subtracts from the recurring interval per documented precedence rules
   (see `data-model.md`).

---

### User Story 3 - Operator creates a booking (Priority: P1)

An operator selects a service and an open time slot against the workspace's
single implicit bookable resource, reviews the details in a UI check-answers
step, and confirms — creating the Booking directly as `Confirmed`.
[Handoff: Booking lifecycle vocabulary; Founder: Draft/Review are UI-only,
creation lands directly in `Confirmed`, no client selection in the
authoritative Phase-2 flow]

**Why this priority**: This is the Phase-2 MVP path referenced by issue #3's
acceptance criteria.

**Independent test**: Create a booking end-to-end against a real service and
real availability; confirm the blocking interval (service duration + buffers)
is reserved and the created Booking's status is `Confirmed`.

**Acceptance Scenarios**:

1. **Given** a valid service and an open slot, **When** the operator
   completes the booking flow, **Then** a `Confirmed` Booking exists and the
   corresponding blocking interval is occupied. No `Pending` or `Draft` row
   is ever created.
2. **Given** the operator is mid-flow (client-side Draft/Review state),
   **When** they use Back, **Then** previously entered selections (service,
   slot) are preserved client-side [AGENTS.md hard invariant: recoverable
   errors preserve user input]. No server-side row exists to preserve — the
   entered data is UI state only.
3. **Given** the operator cancels out of the flow, **When** they confirm the
   destructive exit, **Then** no booking is created and no capacity was ever
   held (capacity is only reserved at the final `Confirmed` write).
4. **Given** two operators race to book the workspace's implicit resource
   for an overlapping blocking interval, **When** both submit concurrently,
   **Then** exactly one booking commits and the other receives an explicit
   conflict response [ADR-011].
5. **Given** no client/customer identity entity exists in Phase 2, **When**
   the operator completes the booking flow, **Then** no client-selection
   step is required by the authoritative Phase-2 flow. Any client-selection
   visual evidence encountered later in Figma is treated as future/Phase-3
   integration, not a Phase-2 requirement (see Founder decision 5 above).

---

### User Story 4 - Operator manages an existing booking (Priority: P2)

An operator views a booking's detail, reschedules or cancels it, or marks it
completed, with each transition enforcing the booking state machine.
[Handoff: lifecycle states; issue #3 acceptance criteria]

**Independent test**: Cancel a `Confirmed` booking; confirm capacity is
released and no reschedule/cancel is possible afterward (terminal state).

**Acceptance Scenarios**:

1. **Given** a `Confirmed` booking, **When** the operator cancels it with the
   required destructive confirmation, **Then** the booking transitions to
   `Cancelled`, its blocking interval is released, and the action is
   audited.
2. **Given** a `Cancelled` or `Completed` booking, **When** any further
   transition is attempted, **Then** the API rejects it as an invalid
   transition with a `problem+json` response [ADR-013].
3. **Given** a `Confirmed` booking is rescheduled to a new slot that now
   conflicts with another booking, **When** the reschedule is submitted,
   **Then** the database exclusion constraint rejects the conflicting write
   and the booking's prior state is unchanged [ADR-011].
4. **Given** two operators open the same booking for edit concurrently,
   **When** both submit conflicting edits, **Then** the second writer
   receives a stale-version conflict rather than silently overwriting the
   first (see `research.md` R-OCC).

---

### User Story 5 - Client/operator views Calendar (Priority: P2)

An operator (desktop and mobile) views a calendar surface composed from
Scheduling availability and Booking occupancy, navigates dates, and enters
booking creation from an open slot. [Handoff: mobile IA
`Home · Calendar · Clients · Recovery · More`]

**Independent test**: Render Calendar for a date range with a mix of open,
booked, and blocked (time-off) intervals on both desktop and mobile
viewports; confirm no backend Calendar persistence exists (Calendar is a
read composition only, ADR-012).

**Acceptance Scenarios**:

1. **Given** a date range with bookings and time off, **When** Calendar
   loads, **Then** it displays composed availability + occupancy without a
   dedicated Calendar table.
2. **Given** the Calendar is loading, **When** data has not yet returned,
   **Then** a loading state is shown that does not shift layout on resolve.
3. **Given** no bookings exist in the visible range, **When** Calendar
   renders, **Then** an explicit empty state is shown (not a blank grid).
4. **Given** the composed read fails, **When** Calendar renders, **Then** an
   explicit error state with retry is shown, distinguishable from empty.
5. **Given** a user lacks Booking-read capability, **When** they view
   Calendar, **Then** a permission-restricted state is shown, not a silent
   empty/error state.

---

### Edge Cases

- Booking blocking interval crosses midnight in the workspace's local
  timezone — must resolve to correct UTC instants without splitting or
  double-counting [ADR-010].
- Two bookings scheduled back-to-back with zero gap (`[end,end)` adjacency)
  must be permitted; buffers, if configured, must still create genuine
  separation [ADR-010, ADR-011].
- A service is deactivated while a Draft (client-side) booking flow
  references it — the in-flight flow must surface this rather than
  silently completing.
- A recurring availability pattern is edited after bookings already exist
  against the old pattern — existing bookings are **not** retroactively
  invalidated or cancelled by the edit; a future phase may add surfaced
  conflict/reconciliation UX if a real need is demonstrated (Founder
  decision on Q4, non-blocking).
- Workspace switch mid-flow must not leak Catalog/Scheduling/Booking data
  across workspaces (constitution IV, ADR-008).
- Optimistic-concurrency conflict on booking edit must produce a
  distinguishable, recoverable error rather than a generic 500.
- A Phase-2 Booking has no `client_id`; any later Phase-3 migration adding
  the Booking↔Client association must be additive and must not require
  Phase-2 data backfill beyond a nullable new column (see `research.md`
  R-CLIENTS).

## Requirements *(mandatory)*

### Functional Requirements

#### Catalog

- **FR-001**: System MUST let a capability-holding user create/update/deactivate
  a Service with name, duration (minutes, integer ≥ 1), price (integer minor
  units + ISO currency per ADR-015), optional pre-buffer, optional
  post-buffer (minutes, integer ≥ 0).
- **FR-002**: System MUST scope every Service to exactly one workspace via
  RLS (ADR-008); no cross-workspace Service visibility.
- **FR-003**: System MAY group Services under a simple, optional Service
  Category (name + sort order only — no nesting, icons, or taxonomy
  framework; Founder-finalized default for Q6).
- **FR-004**: System MUST support Service `active`/`inactive` state;
  inactive Services cannot be selected for new Bookings but remain
  referenced by historical Bookings.
- **FR-005**: **Deferred.** Service add-ons are not implemented in Phase 2
  (Founder-finalized default for Q5) — no generic modifier/discount engine.
  If concrete Figma/product evidence later proves add-ons are required for
  the Phase-2 booking MVP, they are added via an additive migration
  following the narrow two-independent-deltas shape recorded in
  `research.md` R-ADDON, not a generic commerce engine.
- **FR-006**: **Deferred to a future integration port.** Phase 2 does not
  persist a staff-service capability table, because no concrete staff
  identity source exists on current `main` to truthfully key it against
  (Founder decision 3). The capability boundary is documented as a future
  Catalog↔Staff application-port integration point, not implemented now.
  Catalog MUST NOT create staff profile rows, synthetic staff identities,
  or staff CRUD of any kind.
- **FR-007**: Catalog management (create/update/deactivate Service, manage
  categories) MUST require an explicit capability; UI controls reflect but
  never replace server authorization (ADR-009).

#### Scheduling

- **FR-010**: System MUST represent availability as half-open intervals
  `[start,end)` in UTC instants derived from local wall time + IANA
  timezone + recurrence rule (ADR-010).
- **FR-011**: System MUST support a recurring weekly working pattern for
  the workspace's single implicit bookable resource (Founder decision 3 —
  no multi-staff resource dimension in Phase 2).
- **FR-012**: System MUST support time-off/exception intervals that
  subtract from recurring availability, with documented precedence
  (exception always wins over recurring pattern for the overlapping span).
- **FR-013**: System MUST provide interval algebra (normalize, merge,
  intersect, subtract) as pure, property-testable functions independent of
  persistence.
- **FR-014**: System MUST correctly resolve recurring local time across DST
  forward gaps (skip the non-existent hour) and repeated hours (resolve
  deterministically to one instant range; document the choice in
  `research.md`).
- **FR-015**: System MUST compute a bounded expansion horizon for recurring
  availability (not unbounded recurrence materialization) and document the
  horizon value/rationale.
- **FR-016**: Scheduling MUST NOT own Booking records, staff HR data, or a
  persisted Calendar entity (ADR-012).

#### Booking

- **FR-020**: System MUST model a Booking aggregate with an explicit state
  machine. Canonical persisted states in Phase 2: `Confirmed`, `Completed`,
  `Cancelled`. `Draft` and `Review` are client/UI-only concepts and are
  **never** persisted (Founder decision 1). `Pending` is **not** a
  Phase-2-reachable persisted state — it is documented as a future
  lifecycle extension point only (Founder decision 2), not added to the
  Phase-2 enum merely for speculative future use.
- **FR-021**: Every state transition MUST define source state, triggering
  command, destination state, required capability, invariants,
  idempotency behavior, and audit/outbox implications (see `data-model.md`
  state machine table).
- **FR-022**: System MUST compute a single blocking interval per Booking =
  service duration + pre-buffer + post-buffer, in UTC, half-open.
- **FR-023**: System MUST prevent two blocking-state Bookings (`Confirmed`
  bookings — see `research.md` R-EXCL for which states count as blocking)
  within the same workspace from occupying overlapping blocking intervals,
  enforced by a PostgreSQL exclusion constraint keyed on `workspace_id`
  (the workspace **is** the single implicit protected resource — Founder
  decision 3; ADR-011) — application-level checks are UX-only and never the
  sole protection.
- **FR-024**: System MUST support Booking cancellation with an explicit,
  irreversible transition to `Cancelled`, releasing the blocking interval,
  requiring a destructive-action confirmation in the UI, and recording an
  audit entry.
- **FR-025**: System MUST support Booking reschedule (time change) where
  evidence justifies it, reusing the same overlap-prevention path as
  creation (no bypass).
- **FR-026**: System MUST use optimistic concurrency (a version/revision
  column) for Booking edits where two concurrent edits to the same Booking
  are realistically possible (see `research.md` R-OCC), returning a
  stale-write `problem+json` conflict rather than silently overwriting.
- **FR-027**: System MUST emit outbox events for accepted state transitions
  per `research.md`/event-catalogue evaluation — only events with a genuine
  Phase-2-or-later consumer need are added (ADR-024); Phase 2 does not
  implement Recovery/Notifications consumers.
- **FR-028**: Booking read/create/edit/cancel/complete each require an
  explicit capability (ADR-009); no action is authorized by UI role display
  alone.
- **FR-029**: Booking MUST NOT persist a `client_id` or any customer/
  contact/profile reference in Phase 2 (Founder decision 5) — no
  customer/client identity entity exists on current `main`, and Phase 2
  must not reinterpret `identity.users`, workspace memberships, or staff
  identities as customer records to work around this. Phase 2 Booking is
  fully valid and usable without a Clients-domain dependency. Phase 3 adds
  the Booking↔Client association via an additive migration/application-port
  integration (see `research.md` R-CLIENTS).

#### Calendar (composition/read surface)

- **FR-030**: Calendar MUST be implemented as a composition over Scheduling
  availability + Booking occupancy — no dedicated Calendar persistence
  table (ADR-012).
- **FR-031**: Calendar MUST provide desktop and mobile layouts that are
  deliberate substitutions, not a compressed desktop layout, consistent
  with the mobile IA `Home · Calendar · Clients · Recovery · More`.
- **FR-032**: Calendar MUST have explicit loading, empty, error, and
  permission-restricted states (constitution II; AGENTS.md hard invariants).

#### Cross-cutting

- **FR-040**: Every Phase-2 tenant-owned table MUST have `workspace_id`,
  RLS enabled, RLS forced, and an isolation test (ADR-008).
- **FR-041**: Every Phase-2 API endpoint MUST use runtime-schema-first
  request/response validation feeding generated OpenAPI/`@slotnova/contracts`
  (ADR-013); no hand-written duplicate DTOs.
- **FR-042**: Every Phase-2 API failure MUST use `application/problem+json`
  (ADR-013).
- **FR-043**: No state-changing Phase-2 endpoint MAY use HTTP GET
  (AGENTS.md hard prohibition).
- **FR-044**: No Phase-2 domain/UI code MAY import a provider SDK directly
  (AGENTS.md hard prohibition) — not applicable to any external provider in
  Phase 2 scope, but the constraint is recorded for completeness.

### Key Entities

- **Service** (Catalog) — name, description, duration, pre/post buffer,
  price (minor units + currency), category (optional), active state,
  workspace-owned.
- **ServiceCategory** (Catalog, optional) — name, sort order,
  workspace-owned, groups Services. No nesting/icons/taxonomy framework.
- **AvailabilityPattern** (Scheduling) — weekly recurrence rule, IANA
  timezone, workspace-owned. No resource/location dimension in Phase 2 —
  one pattern set per workspace (single implicit bookable resource).
- **AvailabilityException** (Scheduling) — date/time range or recurring
  exception, subtracts from the workspace's pattern, workspace-owned.
- **Booking** (Booking) — service reference, start/end instant, computed
  blocking interval, state (`Confirmed`/`Completed`/`Cancelled`), version,
  workspace-owned. No resource/location/client reference in Phase 2.

**Explicitly not modeled in Phase 2** (see `data-model.md` non-entities):
`ServiceAddOn`, `StaffServiceCapability`, any staff profile/identity table,
any Booking `client_id`/customer table, any `location_id` column.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two truly concurrent conflicting booking-creation attempts
  (independent DB connections) against the workspace's single implicit
  resource result in exactly one commit and one explicit conflict response,
  proven with real PostgreSQL and real concurrent connections (not
  sequential calls, not mocks).
- **SC-002**: Half-open `[start,end)` interval semantics are proven by
  property tests: adjacent intervals (`end == start`) do not overlap;
  intervals with any non-zero overlap are rejected.
- **SC-003**: Buffer-inclusive blocking intervals are proven to participate
  in overlap detection (a booking whose buffer — not its service time —
  overlaps another booking's buffer is rejected).
- **SC-004**: DST forward-gap and repeated-hour recurrence expansion is
  proven by property tests with no phantom or duplicated intervals.
- **SC-005**: 100% of Phase-2 tenant-owned tables pass an automated RLS
  isolation test (row from workspace A is never visible/writable under
  workspace B's context).
- **SC-006**: The Booking state machine rejects 100% of enumerated invalid
  transitions with `problem+json` responses, proven by table-driven tests.
- **SC-007**: OpenAPI/generated `@slotnova/contracts` artifacts are
  deterministic across repeated generation runs for every Phase-2 endpoint.
- **SC-008**: Booking creation and Calendar flows render correctly at both
  a representative desktop width and a representative mobile width (≤ 400px
  per repository accessibility/responsive convention).
- **SC-009**: Every changed interactive flow (Booking create/cancel/
  reschedule, Calendar date navigation) passes keyboard-only operation and
  automated accessibility (axe) checks with zero critical violations.
- **SC-010**: No Recovery, Payments, Notifications, Messaging, Staff
  product UI, Clients/customer persistence, Inventory, Marketing, or
  Analytics behavior is introduced by Phase 2 (verified by the consistency
  review and PR diff scope).
- **SC-011**: Phase 2 ships as a bounded PR sequence (`tasks.md`) with no
  single PR exceeding the repository's existing heavy-lane review/CI budget
  expectations established in Phase 1.

## Assumptions

- The job scheduler selected under ADR-014 (Phase 1 exit condition) is
  available for any delayed/recurring Phase-2 need; Phase 2 is not expected
  to require one for its MVP scope (no reminders/expiry in scope).
- Phase 3 will introduce a Clients-domain identity that Booking can
  reference via an additive migration; Phase 2 does not anticipate its
  shape beyond noting the future association point (`research.md`
  R-CLIENTS).

## Dependencies

- Phase 1 platform foundation (session/authz/RLS/outbox/contracts pipeline)
  — merged (PR #55).
- ADR-010 (time/timezone), ADR-011 (overlap), ADR-012 (module map), ADR-013
  (API contracts), ADR-015 (money) as directly load-bearing for this
  feature.
- `@js-temporal/polyfill` availability in the backend/domain layer per
  ADR-010.
- `btree_gist` PostgreSQL extension availability per ADR-011.

## Out of Scope

- Recovery (offer/acceptance/attribution) — explicitly a different domain
  (AGENTS.md hard invariant); Phase 2 may emit events a future Recovery
  consumer could use, but implements no Recovery behavior.
- Payment processing, checkout, deposits, no-show fees.
- Notification/message delivery (templates, throttling, provider adapters).
- Staff profile management, staff scheduling UI, HR data, staff-service
  capability persistence (deferred to a future integration port).
- **Clients/customer identity of any kind** — no `client_id`, no
  booking-local customer/contact/profile table or snapshot as a workaround.
  Phase 3 owns this.
- Multi-location resource scope — deferred entirely; no speculative
  `location_id` column.
- Service add-ons — deferred; no generic commerce/discount engine.
- Inventory, Marketing/Retention campaigns, Analytics read models.

## Open Product Questions

The Founder review in this revision resolved the four originally
Founder-blocking questions (Draft persistence, initial creation state,
resource/staff scope, location scope) and the Clients sequencing gap found
by independent review — see `## Clarifications` above. Nothing in this
section blocks starting implementation; all remaining items are
non-blocking, Founder-finalized defaults, kept here only as a record of
where evidence (not invention) drove the decision:

- **Q4 — Retroactive availability edits (resolved, non-blocking).**
  Existing Bookings remain valid when future availability changes; no
  retroactive cancellation. Surfaced conflict/reconciliation UX is deferred
  until specifically required.
- **Q5 — Add-on model (resolved, non-blocking).** Deferred from Phase 2
  entirely unless concrete Figma/product evidence later proves necessity.
- **Q6 — Category necessity (resolved, non-blocking).** A simple optional
  `ServiceCategory` (name + sort order) is included; no nesting/icons/
  taxonomy framework.

No further Open Product Questions remain from the original Q1/Q2/Q3/Q7 set —
all four were Founder-resolved (see Clarifications). Any *new* ambiguity
discovered once Figma access becomes available should be added here rather
than resolved by inference.
