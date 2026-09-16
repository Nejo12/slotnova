# Tasks: Phase 2 — Catalog, Scheduling & Booking

Status: planning only. No task below is authorized to start until this
planning PR is Founder-approved/merged **and** the three Founder decisions
in `plan.md` (`## Founder decisions required`: Q1/Q2 Draft persistence,
Q3 resource/staff scope, Q7 location scope) are resolved.

## Task detail convention

Each task lists: dependency, files/areas, acceptance criteria, required
tests, constraints, out-of-scope. PR numbers are sequential and bounded —
no PR combines schema + API + UI for more than one module at a time.

## PR-01 — Catalog domain/schema foundation

- **Dependency**: none (starts from `main` post-Phase-1).
- **Files/areas**: `apps/api/src/modules/catalog/{domain,infrastructure}`,
  migration for `services`, `service_categories` (if R-CAT accepted),
  `service_add_ons` (if R-ADDON accepted), `staff_service_capabilities`.
- **Acceptance criteria**: Service CRUD-minus-delete (create/update/
  deactivate) at the domain/repository layer; duration/buffer/price
  validation; RLS enabled+forced on all new tables.
- **Required tests**: unit tests for validation invariants; real-PG RLS
  isolation test per table.
- **Constraints**: no staff profile table; no HTTP layer yet.
- **Out of scope**: API endpoints (PR-02), Scheduling, Booking.

## PR-02 — Catalog API/contracts

- **Dependency**: PR-01.
- **Files/areas**: `apps/api/src/modules/catalog/http`, runtime schemas,
  generated OpenAPI delta, `packages/contracts` regeneration.
- **Acceptance criteria**: endpoints per `contracts/catalog.contract.md`
  live, capability-gated, `problem+json` failures.
- **Required tests**: Nest integration tests against real PostgreSQL;
  contract-drift test (generated client matches committed OpenAPI);
  authorization tests (missing-capability → 403).
- **Constraints**: no hand-written DTOs duplicating the runtime schema.
- **Out of scope**: Catalog management UI (deferred unless a later PR
  demonstrates Phase-2 UI needs it beyond service selection in Booking).

## PR-03 — Scheduling interval/recurrence domain

- **Dependency**: none beyond Phase-1 platform (can run parallel to
  PR-01/02).
- **Files/areas**: `apps/api/src/modules/scheduling/domain` — pure
  interval algebra (normalize/merge/intersect/subtract), recurrence
  expansion using `@js-temporal/polyfill`, DST disambiguation per
  `research.md` R-DST.
- **Acceptance criteria**: FR-010–FR-015 satisfied at the domain layer,
  independent of persistence.
- **Required tests**: fast-check property tests for normalize/merge/
  intersect/subtract, half-open adjacency, DST forward-gap and
  repeated-hour cases, bounded expansion horizon.
- **Constraints**: no `Date` usage; no persistence in this PR.
- **Out of scope**: API, Booking, persistence.

## PR-04 — Scheduling persistence/API

- **Dependency**: PR-03.
- **Files/areas**: `apps/api/src/modules/scheduling/{infrastructure,http}`,
  migration for `availability_patterns`, `availability_exceptions`.
- **Acceptance criteria**: endpoints per `contracts/scheduling.contract.md`
  live; `resolve` endpoint applies exceptions over patterns per documented
  precedence.
- **Required tests**: real-PG RLS isolation; integration tests for
  pattern+exception interaction; contract tests.
- **Constraints**: no Booking awareness in this module.
- **Out of scope**: Booking, Calendar.

## PR-05 — Booking aggregate/schema/state machine

- **Dependency**: PR-01 (Service reference), PR-03 (interval algebra
  reused for blocking-range computation). Requires Founder decisions
  Q1/Q2/Q3/Q7 resolved before starting.
- **Files/areas**: `apps/api/src/modules/booking/domain`, migration for
  `bookings` (without the exclusion constraint yet — see PR-06).
- **Acceptance criteria**: state machine per `data-model.md` transition
  table implemented and enforced at the domain layer; `version` column and
  optimistic-concurrency guard present.
- **Required tests**: table-driven valid/invalid transition unit tests
  covering every row in the transition table, including idempotent no-ops
  and terminal-state rejection.
- **Constraints**: no HTTP layer, no exclusion constraint yet (isolates
  the state-machine proof from the concurrency proof for clean review).
- **Out of scope**: overlap prevention (PR-06), API (PR-07).

## PR-06 — Booking overlap/concurrency

- **Dependency**: PR-05.
- **Files/areas**: migration adding `btree_gist` + the exclusion
  constraint (`research.md` R-EXCL), application-layer translation of the
  DB conflict into a domain/`problem+json` `booking-overlap` response.
- **Acceptance criteria**: SC-001 and SC-003 satisfied.
- **Required tests**: **real PostgreSQL, two independent concurrent
  connections**, attempting conflicting blocking bookings — proves at
  most one commits. A second concurrency test proves the optimistic-
  concurrency `version` guard (PR-05) under concurrent edits to the same
  row. Sequential-call tests are explicitly insufficient and will be
  rejected in review.
- **Constraints**: no check-then-insert as the sole protection (AGENTS.md
  hard prohibition) — this PR is exactly where that prohibition is load-
  bearing.
- **Out of scope**: API surface (PR-07).

## PR-07 — Booking API/contracts

- **Dependency**: PR-06.
- **Files/areas**: `apps/api/src/modules/booking/http`, runtime schemas,
  OpenAPI/`packages/contracts` regeneration.
- **Acceptance criteria**: endpoints per `contracts/booking.contract.md`
  live; idempotency-key handling on create; capability-gated per action.
- **Required tests**: Nest integration tests against real PostgreSQL for
  every endpoint and every `problem+json` conflict type; contract-drift
  test.
- **Constraints**: no GET for any mutating action.
- **Out of scope**: frontend (PR-08).

## PR-08 — Booking frontend flow

- **Dependency**: PR-07 (generated client available).
- **Files/areas**: `apps/web/src/features/booking` — create/review/detail/
  cancel flow, TanStack Query workspace-scoped keys, SCSS Modules +
  semantic tokens.
- **Acceptance criteria**: primary path, Back, Cancel, destructive
  confirmation, loading, error recovery (including `booking-overlap` and
  `stale-write` distinguishable messaging), input preservation across
  Back/error, keyboard/focus behavior, touch targets, Light/Dark, reduced
  motion — all per FR-020–FR-028 and the AGENTS.md hard invariants.
- **Required tests**: component tests for each state (loading/error/
  overlap-conflict/stale-write-conflict); axe automated checks;
  keyboard-only interaction test.
- **Constraints**: no Tailwind; no client-side authorization shortcuts
  (server remains authoritative).
- **Out of scope**: Calendar UI (PR-09).

## PR-09 — Calendar composition/UI

- **Dependency**: PR-04 (Scheduling resolve), PR-07 (Booking list/detail),
  and the composition endpoint from `research.md` R-CAL (thin
  `apps/api/src/modules/calendar-read` application service with no
  migration).
- **Files/areas**: `apps/web/src/features/calendar`; the one composition
  endpoint's `http`/`application` layers (no `infrastructure`/table
  layer).
- **Acceptance criteria**: FR-030–FR-032; desktop + mobile deliberate
  layouts; loading/empty/error/permission-restricted states; date
  navigation; booking-selection entry into the PR-08 create flow.
- **Required tests**: component tests for each Calendar state; contract
  test for the composition endpoint; a11y checks; visual regression
  limited to stable primitives (day/slot cell, state banners) — not the
  full dynamic grid (AGENTS.md testing guidance).
- **Constraints**: no Calendar persistence table under any circumstance.
- **Out of scope**: Recovery/Retention surfaces referenced elsewhere in
  the mobile IA (`More`, `Recovery` nav items) — Calendar only.

## PR-10 — Phase-2 E2E/hardening/exit

- **Dependency**: PR-01…PR-09.
- **Files/areas**: `apps/web` Playwright specs, `.slotnova/CURRENT.md`,
  `docs/decisions/000X-*.md` Phase-2 exit records, `docs/phase-2-exit.md`
  (new, mirroring `docs/phase-1-exit.md`'s evidence-matrix format).
- **Acceptance criteria**: all success criteria in `spec.md` demonstrably
  pass with recorded evidence, mirroring the Phase-1 exit precedent.
- **Required tests**: the critical E2E set (create/confirm booking,
  cancel booking, workspace-switch isolation, conflicted-slot handling);
  full quickstart re-run.
- **Constraints**: no scope creep into Phase 3 (Clients/Notifications/
  Messaging) work.
- **Out of scope**: everything listed in `spec.md`'s Out of Scope section.

## Dependencies & Execution Order

### Phase order

PR-01/02 (Catalog) and PR-03 (Scheduling domain) can run in parallel.
PR-04 depends on PR-03. PR-05 depends on PR-01 + PR-03 and on the three
Founder decisions. PR-06 depends on PR-05. PR-07 depends on PR-06. PR-08
depends on PR-07. PR-09 depends on PR-04 + PR-07. PR-10 depends on all.

### Parallel opportunities

- PR-01/02 and PR-03 (no shared files, no shared schema).
- Within PR-08/PR-09 frontend work, component-test authoring can start
  against contract mocks (MSW) before the corresponding backend PR merges,
  per the existing Phase-1 contracts-pipeline convention.

### No mega-PR

No single PR combines schema + API + UI for more than one module; PR-05/
PR-06 deliberately split the state-machine proof from the concurrency
proof so each is independently reviewable, matching the rigor ADR-011
demands for the highest-risk invariant in this feature.
