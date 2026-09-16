# Implementation Plan: Phase 2 — Catalog, Scheduling & Booking

Status: Planning only. No implementation code is authorized by this PR
(issue #56 hard gate).

## Summary

Deliver Catalog (service definitions), Scheduling (interval algebra +
availability), and Booking (aggregate + state machine + overlap-safe
persistence), with Calendar as a thin read composition. Core-tier DDD
ceremony applies to Scheduling and Booking (ADR-012); Catalog uses
supporting-tier structure with a domain layer only where duration/buffer/
add-on invariants justify it; Calendar is UI-only, no backend module.

## Technical Context

- Backend: NestJS + Fastify, PostgreSQL + Drizzle, per-module schema
  ownership, RLS (ADR-004, ADR-008).
- Time: `@js-temporal/polyfill`, `timestamptz` persistence, IANA timezone
  storage, half-open intervals (ADR-010).
- Overlap: `btree_gist` exclusion constraint over the blocking interval
  (ADR-011).
- API: Zod-compatible runtime schemas → OpenAPI → `@slotnova/contracts`,
  `problem+json` errors (ADR-013).
- Async: transactional outbox for accepted cross-boundary events only
  (ADR-005, ADR-024); Phase 2 introduces no new job-scheduler need.
- Frontend: React + TanStack Query (workspace-scoped keys) + Zustand
  (client-only state only, if any) + SCSS Modules + semantic tokens; no
  Tailwind.
- Testing: Vitest + fast-check property tests, Testcontainers + real
  PostgreSQL for RLS/constraints/concurrency, Playwright for the critical
  journeys, axe + manual keyboard checks (ADR-006).

## Constitution Check

| Principle | Check | Status |
|---|---|---|
| I — Product truth is explicit | Figma pages 06/07/18/19 inaccessible this session; `docs/product-handoff.md` used as fallback authority; gaps recorded as Open Product Questions, not invented | Pass (with recorded limitation) |
| II — Correctness at strongest boundary | Overlap enforced by PostgreSQL exclusion constraint, not app-level check-then-insert; state machine enforced in domain layer + tested | Pass |
| III — Modular monolith, bounded ownership | Catalog/Scheduling/Booking/Calendar cross-module access via application ports only; Calendar has no persistence | Pass — verify at task-review time |
| IV — Multi-tenant, time-safe, money-safe | RLS matrix planned per table (`data-model.md`); Temporal-based half-open intervals; money reuses ADR-015 minor-units model, no new money logic | Pass |
| V — Tests prove behavior | Real-PG concurrency test required for SC-001; property tests for interval algebra/DST; table-driven state-machine tests | Pass — enforced in `tasks.md` acceptance criteria |
| VI — Simple architecture | No add-on/category model unless `research.md` justifies it; rule of three applied before any shared abstraction | Pass — see Open Product Questions Q5/Q6 |
| VII — Agents are contributors | This plan reconciles to constitution/ADRs; no auto-merge; Founder decision requested for unresolved Qs | Pass |

No constitution violation requiring Complexity Tracking was identified. Two
areas are flagged as **Founder-blocking** (not constitution violations, but
undecided product scope that changes the data model): resource/staff scope
(Q3) and Draft persistence (Q1). See `## Founder decisions required`.

### Post-Design Constitution Re-Check

Re-run after `data-model.md`/`contracts/` drafting: no new violation
introduced. The exclusion-constraint design (`research.md` R-EXCL) keeps
overlap correctness in PostgreSQL, not application code, satisfying
Principle II under the concrete schema.

## Project Structure

### Documentation (this feature)

```text
specs/002-catalog-scheduling-booking/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── catalog.contract.md
│   ├── scheduling.contract.md
│   ├── booking.contract.md
│   └── calendar.contract.md
├── quickstart.md
└── tasks.md
```

### Source Code (planned — not created by this PR)

```text
apps/api/src/modules/
  catalog/          # supporting tier: application + infra + http; domain
                     # layer only for duration/buffer/add-on invariants
  scheduling/        # core tier: domain (interval algebra, recurrence),
                     # application, infrastructure, http
  booking/            # core tier: domain (aggregate, state machine),
                     # application, infrastructure, http
apps/web/src/features/
  catalog/            # service management UI (if Phase 2 UI requires it)
  booking/            # booking create/review/detail/cancel flow
  calendar/           # calendar composition UI (reads scheduling+booking
                     # generated clients; no calendar backend module)
packages/contracts/   # generated OpenAPI client additions for the three
                     # new API boundaries
```

Calendar has **no** `apps/api/src/modules/calendar` directory — it is a
frontend composition per ADR-012, optionally backed by one thin read
endpoint if `research.md` R-CAL concludes N+1 composition is unacceptable.

## Phase 0: Research

See `research.md` for: recurrence representation, exclusion-constraint
shape, optimistic-concurrency approach, Calendar read-composition strategy,
minimal category/add-on models, public/internal booking identifiers, and
resource/staff scope for Phase 2.

## Phase 1: Design & Contracts

See `data-model.md` for entities, RLS matrix, and the Booking state
machine table. See `contracts/` for per-endpoint method/path/auth/
capability/input/response/problem+json/concurrency documentation. See
`quickstart.md` for the reviewer validation sequence.

## Complexity Tracking

No deviation from constitution/ADRs is proposed. If Q3 (resource/staff
scope) resolves to "Phase 2 needs multi-staff scope now," the exclusion
constraint's protected-resource key and the availability model both grow
one more dimension (`resource_id`) — this is anticipated in
`data-model.md` as an explicit column rather than deferred as tech debt,
so no re-plan is needed either way.

## Phase 2 exit decisions — ownership

Recorded as Open Product Questions in `spec.md`, not decision records —
Phase 2 has not started implementation, so there is nothing to formally
exit yet. These become `docs/decisions/` entries once Founder-approved and
once the corresponding PR merges, following the Phase 1 precedent
(`docs/decisions/0001`–`0006`).

## Founder decisions required

1. **Q1/Q2 — Draft persistence and which flow yields Pending vs Confirmed.**
   Changes FR-020, the state machine, and RLS/audit scope for `Draft`.
2. **Q3 — Resource/staff scope.** Changes the exclusion constraint's
   protected-resource key (`data-model.md`) and Scheduling's availability
   model dimensionality.
3. **Q7 — Location scope.** Changes whether `location_id` participates in
   the protected-resource key.

Everything else in `spec.md`'s Open Product Questions (Q4–Q6) is
recommended-and-bounded in `research.md` (safe defaults with a documented
fallback) and does not block starting implementation once Q1/Q2/Q3/Q7 are
answered.

## Progress

- [x] Phase 0: Research complete (`research.md`)
- [x] Phase 1: Design & contracts complete (`data-model.md`, `contracts/`)
- [ ] Phase 2: Task breakdown (`tasks.md`) — complete, pending Founder
      review of the three decisions above before any task starts
- [ ] Founder approval of this planning PR
- [ ] Phase 2 implementation (blocked until the above)
