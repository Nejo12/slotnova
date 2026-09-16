# Implementation Plan: Phase 2 — Catalog, Scheduling & Booking

Status: Planning only. No implementation code is authorized by this PR
(issue #56 hard gate). This revision incorporates Founder decisions on
Draft/Confirmed lifecycle, resource/staff scope, location scope, and an
independent-review finding on Clients sequencing (see `spec.md`
Clarifications, session 2026-09-16 Founder review).

## Summary

Deliver Catalog (service definitions), Scheduling (interval algebra +
availability), and Booking (aggregate + state machine + overlap-safe
persistence), with Calendar as a thin read composition. Core-tier DDD
ceremony applies to Scheduling and Booking (ADR-012); Catalog uses
supporting-tier structure with a domain layer only where duration/buffer
invariants justify it; Calendar is UI-only, no backend module.

Phase 2 scope, as Founder-corrected, is deliberately smaller than the first
planning draft: a single implicit workspace-level bookable resource, direct
`Confirmed` creation with no persisted `Draft`/`Pending`, no location
dimension, no staff-service capability persistence, and no client
reference on Booking.

## Technical Context

- Backend: NestJS + Fastify, PostgreSQL + Drizzle, per-module schema
  ownership, RLS (ADR-004, ADR-008).
- Time: `@js-temporal/polyfill`, `timestamptz` persistence, IANA timezone
  storage, half-open intervals (ADR-010).
- Overlap: `btree_gist` exclusion constraint keyed on `workspace_id` (the
  workspace is the single implicit protected resource) over the blocking
  interval (ADR-011).
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
| I — Product truth is explicit | Figma pages 06/07/18/19 inaccessible this session; `docs/product-handoff.md` used as fallback authority; the four originally open gaps were closed by explicit Founder decision rather than invention; remaining non-blocking defaults are labeled and bounded | Pass |
| II — Correctness at strongest boundary | Overlap enforced by PostgreSQL exclusion constraint keyed on `workspace_id`, not app-level check-then-insert; state machine enforced in domain layer + tested | Pass |
| III — Modular monolith, bounded ownership | Catalog/Scheduling/Booking/Calendar cross-module access via application ports only; Calendar has no persistence; staff-service capability explicitly deferred to a future port rather than pulled forward | Pass |
| IV — Multi-tenant, time-safe, money-safe | RLS matrix planned per table (`data-model.md`); Temporal-based half-open intervals; money reuses ADR-015 minor-units model, no new money logic | Pass |
| V — Tests prove behavior | Real-PG concurrency test required for SC-001; property tests for interval algebra/DST; table-driven state-machine tests | Pass |
| VI — Simple architecture | No speculative `location_id`, no staff-service capability table without a real identity source, no client-side workaround table for Clients, no add-on engine — every deferred concept is deferred, not half-built | Pass |
| VII — Agents are contributors | This plan reconciles to constitution/ADRs and the Founder's explicit decisions; no auto-merge | Pass |

No constitution violation was identified. The prior revision's three
Founder-blocking items are now resolved (see below); no new
Founder-blocking item was introduced by the Clients-sequencing correction —
it resolves in the direction of *less* Phase-2 scope, not more.

### Post-Design Constitution Re-Check

Re-run after the Founder-corrected `data-model.md`/`contracts/` drafting:
no new violation introduced. Removing `resource_id`/`location_id`/
`client_id`/`staff_service_capabilities` from the schema is a
*simplification* relative to the first draft, consistent with Principle VI
(no speculative abstraction). The exclusion constraint keyed on
`workspace_id` alone still satisfies Principle II under ADR-011 because the
workspace is genuinely the only protected resource Phase 2 defines.

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
                     # layer only for duration/buffer invariants; no
                     # staff-service-capability persistence
  scheduling/        # core tier: domain (interval algebra, recurrence),
                     # application, infrastructure, http; single
                     # workspace-level pattern, no resource/location column
  booking/            # core tier: domain (aggregate, state machine),
                     # application, infrastructure, http; no client_id
apps/web/src/features/
  catalog/            # service management UI (if Phase 2 UI requires it)
  booking/            # booking create/review/detail/cancel flow — no
                     # client-selection step in the authoritative flow
  calendar/           # calendar composition UI (reads scheduling+booking
                     # generated clients; no calendar backend module)
packages/contracts/   # generated OpenAPI client additions for the three
                     # new API boundaries
```

Calendar has **no** `apps/api/src/modules/calendar` directory — it is a
frontend composition per ADR-012, backed by one thin read endpoint
(`research.md` R-CAL).

## Phase 0: Research

See `research.md` for: recurrence representation, exclusion-constraint
shape (now workspace-keyed only), Calendar read-composition strategy,
minimal category model, DST resolution rule, public/internal booking
identifiers, and the Clients-sequencing finding (`R-CLIENTS`). The
add-on model (R-ADDON) and staff/resource scope (R-SCOPE) research items
are retained with their conclusions updated to reflect the Founder's
"defer"/"single implicit resource" decisions.

## Phase 1: Design & Contracts

See `data-model.md` for entities, RLS matrix, and the Booking state
machine table (now `Confirmed → Completed`/`Cancelled` only). See
`contracts/` for per-endpoint method/path/auth/capability/input/response/
problem+json/concurrency documentation, with `resourceId`/`locationId`/
`clientId` removed from all Phase-2 request shapes. See `quickstart.md`
for the reviewer validation sequence.

## Complexity Tracking

No deviation from constitution/ADRs is proposed. This revision *removes*
complexity relative to the first draft (no resource/location dimension, no
staff capability table, no client reference) rather than adding it. If a
future phase needs multi-staff or multi-location scope, that is a new
additive migration adding `resource_id`/`location_id` columns and widening
the exclusion constraint — explicitly deferred, not pre-built here.

## Founder decisions — final dispositions

All four items flagged Founder-blocking in the prior revision are now
resolved, plus the Clients-sequencing gap raised by independent review:

1. **Draft/Review persistence** — Not persisted. Client/UI-only. Resolved.
2. **Initial Booking creation state** — `Confirmed`, directly, no
   `Pending` producer in Phase 2. Resolved.
3. **Resource/staff scope** — Single implicit workspace-level resource; no
   staff identity/CRUD; staff-service capability deferred to a future
   integration port. Resolved.
4. **Location scope** — Deferred entirely; no speculative `location_id`.
   Resolved.
5. **Clients sequencing** (independent-review finding) — No `client_id` on
   Phase-2 Booking; no workaround table; Phase 3 owns the association via
   an additive migration. Resolved.

No Founder decision remains open for Phase 2 to begin implementation once
this planning PR merges.

## Progress

- [x] Phase 0: Research complete (`research.md`)
- [x] Phase 1: Design & contracts complete (`data-model.md`, `contracts/`)
- [x] Phase 2: Task breakdown (`tasks.md`) — re-sequenced for the
      Founder-corrected model
- [ ] Founder approval of this planning PR (#57)
- [ ] Phase 2 implementation (blocked until PR #57 is merged)
