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
- Figma pages `06 — Calendar`, `07 — Booking`, `18 — Prototypes`,
  `19 — Implementation Handoff`: **not accessible in this planning session**
  (see `## Figma access` below). All UI-flow detail below is sourced from
  `docs/product-handoff.md`; anything not covered there is recorded as an
  open product question rather than invented.

## Figma access

Per the AGENTS.md/CLAUDE.md Figma caveat, this session's Figma tooling
exposed authentication scaffolding only and could not retrieve node content
for `06 — Calendar`, `07 — Booking`, `18 — Prototypes`, or
`19 — Implementation Handoff`. This is recorded as a **visual-access
limitation**, not evidence that the design is absent. Every interaction
requirement below is labeled as one of:

- **[Handoff]** — sourced from `docs/product-handoff.md` (committed, authoritative)
- **[ADR]** — sourced from an accepted ADR
- **[Inference]** — planning inference, not yet confirmed against Figma or an
  explicit product decision; listed in `## Open Product Questions`
- **[Open]** — unresolved, requires Figma access or a Founder decision before
  implementation

## Clarifications

### Session 2026-09-16

No live clarification session was run against a human stakeholder in this
planning pass (no `speckit-clarify` interactive session available for a
docs-only planning task with no reachable Figma detail). Every ambiguity that
would normally be resolved by clarification is instead recorded verbatim in
`## Open Product Questions` and carried into `research.md` for explicit
Founder disposition. This spec does not invent answers to close them.

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
weekly working pattern and optional time-off exceptions for a bookable
resource, so Scheduling can compute open/blocked intervals. [ADR-010;
Handoff: Calendar as read surface]

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

### User Story 3 - Client-facing operator creates a booking (Priority: P1)

An operator selects a service (and staff/resource where applicable), a
client, and an open time slot, reviews the details, and confirms a booking.
[Handoff: Booking lifecycle `Draft → Review → Pending/Confirmed → Completed`]

**Why this priority**: This is the Phase-2 MVP path referenced by issue #3's
acceptance criteria.

**Independent test**: Create a booking end-to-end against a real service and
real availability; confirm the blocking interval (service duration + buffers)
is reserved.

**Acceptance Scenarios**:

1. **Given** a valid service and an open slot, **When** the operator
   completes the booking flow, **Then** a `Pending` or `Confirmed` booking
   exists (see `## Open Product Questions` — Q1 on which state creation
   lands in) and the corresponding blocking interval is occupied.
2. **Given** the operator is mid-flow, **When** they use Back, **Then**
   previously entered selections (service, client, slot) are preserved
   [AGENTS.md hard invariant: recoverable errors preserve user input].
3. **Given** the operator cancels out of the flow, **When** they confirm the
   destructive exit, **Then** no booking is created and no capacity is held.
4. **Given** two operators race to book the same resource for an overlapping
   blocking interval, **When** both submit concurrently, **Then** exactly one
   booking commits and the other receives an explicit conflict response
   [ADR-011].

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

- Booking blocking interval crosses midnight in the resource's local
  timezone — must resolve to correct UTC instants without splitting or
  double-counting [ADR-010].
- Two bookings scheduled back-to-back with zero gap (`[end,end)` adjacency)
  must be permitted; buffers, if configured, must still create genuine
  separation [ADR-010, ADR-011].
- A service is deactivated while a Draft booking flow references it — the
  in-flight flow must surface this rather than silently completing.
- A recurring availability pattern is edited after bookings already exist
  against the old pattern — existing bookings are not retroactively
  invalidated (see Open Product Questions Q4).
- Workspace switch mid-flow must not leak Catalog/Scheduling/Booking data
  across workspaces (constitution IV, ADR-008).
- Optimistic-concurrency conflict on booking edit must produce a
  distinguishable, recoverable error rather than a generic 500.

## Requirements *(mandatory)*

### Functional Requirements

#### Catalog

- **FR-001**: System MUST let a capability-holding user create/update/deactivate
  a Service with name, duration (minutes, integer ≥ 1), price (integer minor
  units + ISO currency per ADR-015), optional pre-buffer, optional
  post-buffer (minutes, integer ≥ 0).
- **FR-002**: System MUST scope every Service to exactly one workspace via
  RLS (ADR-008); no cross-workspace Service visibility.
- **FR-003**: System MAY group Services under Service Categories where a
  workspace has more than a handful of services (see `research.md` R-CAT for
  the minimal category model); Categories are optional, not required for a
  bookable Service.
- **FR-004**: System MUST support Service `active`/`inactive` state;
  inactive Services cannot be selected for new Bookings but remain
  referenced by historical Bookings.
- **FR-005**: System MUST define, per planned add-on (if any are accepted —
  see `research.md` R-ADDON), whether it affects price, duration, both, or
  neither. Phase 2 does not introduce generic commerce/discount concepts.
- **FR-006**: System MUST define a staff-service capability boundary (which
  staff can perform which Service) as a **Catalog-owned association only**
  (a capability flag/join), and MUST NOT implement staff profile/schedule
  management — that is a later Staff product phase (ADR-012).
- **FR-007**: Catalog management (create/update/deactivate Service, manage
  categories/add-ons) MUST require an explicit capability; UI controls
  reflect but never replace server authorization (ADR-009).

#### Scheduling

- **FR-010**: System MUST represent availability as half-open intervals
  `[start,end)` in UTC instants derived from local wall time + IANA
  timezone + recurrence rule (ADR-010).
- **FR-011**: System MUST support a recurring weekly working pattern per
  resource (staff, or workspace-level resource where staff scope does not
  yet exist — see `research.md` R-SCOPE).
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
  machine. Canonical persisted states: `Draft` (see Open Product Questions
  Q1 on whether Draft persists), `Pending`, `Confirmed`, `Completed`,
  `Cancelled`. `Review` is a UI-only step over an in-memory/Draft
  representation unless Q1 resolves otherwise.
- **FR-021**: Every state transition MUST define source state, triggering
  command, destination state, required capability, invariants,
  idempotency behavior, and audit/outbox implications (see `data-model.md`
  state machine table).
- **FR-022**: System MUST compute a single blocking interval per Booking =
  service duration + pre-buffer + post-buffer, in UTC, half-open.
- **FR-023**: System MUST prevent two blocking-state Bookings (see
  `research.md` for which states count as blocking) for the same protected
  resource key from occupying overlapping blocking intervals, enforced by a
  PostgreSQL exclusion constraint (ADR-011) — application-level checks are
  UX-only and never the sole protection.
- **FR-024**: System MUST support Booking cancellation with an explicit,
  irreversible transition to `Cancelled`, releasing the blocking interval,
  requiring a destructive-action confirmation in the UI, and recording an
  audit entry.
- **FR-025**: System MUST support Booking reschedule (time/resource change)
  where evidence justifies it, reusing the same overlap-prevention path as
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
- **ServiceCategory** (Catalog, optional) — name, workspace-owned, groups
  Services.
- **ServiceAddOn** (Catalog, if accepted — see research) — name, price/
  duration delta flags, workspace-owned, associated to one or more Services.
- **StaffServiceCapability** (Catalog) — join of a staff identity (owned
  elsewhere) to a Service, indicating capability to perform it; Catalog owns
  only the association, not the staff profile.
- **AvailabilityPattern** (Scheduling) — resource scope, weekly recurrence
  rule, IANA timezone, workspace-owned.
- **AvailabilityException** (Scheduling) — resource scope, date/time range
  or recurring exception, subtracts from pattern, workspace-owned.
- **Booking** (Booking) — service reference, resource/staff reference
  (where applicable), client reference (owned elsewhere), start/end instant,
  computed blocking interval, state, version (if OCC applies), workspace-
  owned.
- **BookingBlockingInterval** — derived value (not necessarily a separate
  table — see `data-model.md`), the exclusion-constraint-protected range.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two truly concurrent conflicting booking-creation attempts
  (independent DB connections) against the same protected resource key
  result in exactly one commit and one explicit conflict response, proven
  with real PostgreSQL and real concurrent connections (not sequential
  calls, not mocks).
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
  product UI, Inventory, Marketing, or Analytics behavior is introduced by
  Phase 2 (verified by the consistency review and PR diff scope).
- **SC-011**: Phase 2 ships as a bounded PR sequence (`tasks.md`) with no
  single PR exceeding the repository's existing heavy-lane review/CI budget
  expectations established in Phase 1.

## Assumptions

- Staff identity (the person performing a Service) exists as a referenceable
  identity from the Identity module by Phase 2; Catalog/Scheduling only
  reference it, they do not own it. If no staff/resource concept exists yet
  at Phase 2 implementation time, Scheduling/Booking resource scope
  defaults to workspace-level (single implicit resource) — see
  `research.md` R-SCOPE and Open Product Question Q3.
- Client identity (the person receiving a Service) exists as a referenceable
  identity Booking can point to; Clients-module ownership of that record is
  out of scope for Phase 2 to build, only to reference.
- The job scheduler selected under ADR-014 (Phase 1 exit condition) is
  available for any delayed/recurring Phase-2 need; Phase 2 is not expected
  to require one for its MVP scope (no reminders/expiry in scope).

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
- Staff profile management, staff scheduling UI, HR data.
- Inventory, Marketing/Retention campaigns, Analytics read models.
- Generic commerce/discount engine beyond the narrow add-on model this spec
  defines (if accepted).
- Multi-location resource scope beyond what `research.md` R-SCOPE
  concludes is genuinely required for Phase 2.

## Open Product Questions

These require Figma access and/or explicit Founder decision before
implementation; they are not resolved by inference in this planning pass.

- **Q1 — Does `Draft` persist?** Is `Draft` a transient client-side/API
  draft resource that only becomes a real row at `Pending`/`Confirmed`, or
  a persisted state from the start? Affects FR-020, the state table, and
  whether Draft needs its own RLS/audit treatment. [Open]
- **Q2 — Pending vs. Confirmed on creation.** Does every new Booking created
  by an operator land directly in `Confirmed` (no separate approval step),
  or does some path require a `Pending` intermediate awaiting confirmation?
  Issue #3's acceptance text says "pending/confirmed," implying both may be
  reachable depending on flow — which flow produces which? [Open]
- **Q3 — Resource/staff scope for Phase 2.** Does Phase 2 need multi-staff
  resource scope now, or is a single implicit workspace-level resource
  sufficient until the later Staff phase? Affects the protected-resource
  key in ADR-011's exclusion constraint and the availability model's
  resource dimension. [Open — see `research.md` R-SCOPE]
- **Q4 — Retroactive availability edits.** When a recurring pattern changes
  after Bookings already exist against the old pattern, must the system
  flag/surface now-conflicting Bookings, or is this deferred entirely to
  manual operator review? [Open]
- **Q5 — Add-on model.** Does Phase 2 need Service add-ons at all, or is
  that safely deferred? If needed, do add-ons affect price only, duration
  only, both, or neither? [Open — see `research.md` R-ADDON]
- **Q6 — Category necessity.** Do Phase-2 Figma flows show service
  categories as a required grouping construct, or is it purely organizational
  and safe to defer? [Open — see `research.md` R-CAT]
- **Q7 — Location scope.** Does Scheduling need multi-location resource
  scope in Phase 2, or is location out of scope until a later phase?
  [Open]
