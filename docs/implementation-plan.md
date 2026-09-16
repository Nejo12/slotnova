# Slotnova Implementation Plan

Slotnova is specification-led. Product implementation begins only after Phase 0 is explicitly approved.

## Phase 0 — Architecture & Engineering Foundation

Status: **Approved.** `docs/architecture/phase-0-gate.md` records founder approval on 2026-09-08.

Deliverables include modular-monolith boundaries, monorepo structure, domain map/tiering, auth/tenancy/time/money/API/async/security/testing/motion/observability/CI decisions, Spec Kit constitution, agent workflow, independent architecture review and reconciliation.

Exit: every required item in `docs/architecture/phase-0-gate.md` is approved and PR #10 is manually merged by the founder.

---

## Phase 1 — Platform Foundation & Shell

Status: **Exit complete (T001–T091 all shipped and verified; PR-01 through PR-20).** All 18 success criteria (SC-001…SC-018) demonstrably pass — see `docs/phase-1-exit.md` for the full evidence matrix. All six Phase 1 exit decision records (`docs/decisions/0001`–`0006`) exist and are founder-approved. Formal Phase 1 exit is contingent only on the founder's manual merge of PR-20 (`feat/pr-20-phase-1-exit`) into `main`, per this repository's merge policy — no further validation or documentation work remains.

### Repository/platform

- initialize pnpm workspace + Turborepo
- `apps/web`, `apps/api`, `apps/worker`
- `packages/ui` with Storybook colocated inside it
- `packages/design-tokens`, generated-contract output, testing/config packages
- split browser/server observability packages
- no business-domain packages

### Web foundation

- React/Vite SPA + React Router data router
- semantic SCSS/token foundation generated from approved Figma variables
- Light/Dark + reduced-motion infrastructure
- desktop/mobile application shells
- TanStack Query with workspace-scoped query-key convention and cache-clear behavior
- base accessible primitives and system-state stories

### API/data/security foundation

- NestJS + Fastify shell
- PostgreSQL + Drizzle migration/test harness
- per-module schema ownership
- minimal Identity/Workspace/Location/Membership/session schema needed for safe tenant context
- secure server-managed session boundary
- PostgreSQL RLS infrastructure and RLS-coverage tests
- authorization policy boundary
- OpenAPI/problem+json generation path
- transactional outbox infrastructure
- benchmark/select Postgres-backed job scheduler (graphile-worker vs pg-boss) before Phase 1 exit

### Quality/operations

- structured logs/request/correlation ids
- OpenTelemetry/Sentry integration seams
- Vitest/Testing Library/MSW/fast-check/Testcontainers/Playwright base harness
- dependency-cruiser + ESLint + Stylelint token rules
- fast/heavy GitHub Actions lanes with Turborepo caching
- deployment environments/migration pipeline per ADR-020

Exit: clean checkout installs/builds/tests; shell works desktop/mobile; secure session + workspace context works; real PostgreSQL test proves RLS isolation; API health/contract generation works; CI enforces architecture/type/test/build gates. No Booking/Recovery product behavior is implemented.

## Phase 2 — Catalog, Scheduling & Booking

- Catalog: services, duration, buffers, prices, add-ons, staff-service capability boundary
- Scheduling: recurring availability, time off input, interval algebra, timezone/DST behavior, blocking intervals
- PostgreSQL booking-overlap exclusion constraint
- Booking workspace/list/detail/create/review/cancel lifecycle
- optimistic concurrency for concurrent booking edits where applicable
- Calendar UI as a composition over Scheduling + Booking
- representative loading/no-results/error states

Testing emphasis: property-based interval/DST tests; real-PG constraint/concurrency tests; booking create/cancel E2E.

Exit: draft → review → pending/confirmed → complete/cancel behavior is correct; two concurrent attempts cannot double-book the same blocking capacity.

## Phase 3 — Clients, Notifications & Messaging

- Clients directory/detail/create
- contact preferences + consent/lawful-basis metadata
- quiet hours/frequency cap policy inputs
- rebooking entry points
- Notifications: templates, delivery records, throttling, provider port, failure/retry states
- Messaging: human inbox/thread/new message and reply seam from Notifications where applicable
- tenant/permission isolation across all APIs

Exit: clients can be found/opened/rebooked; notification eligibility is server-authoritative/auditable; Messaging and Notifications remain separate ownership areas.

## Phase 4 — Recovery Engine

- vacancy + immutable value-at-risk snapshot
- deterministic candidate ranking
- Vacancy/Offer state machines
- public high-entropy offer surface
- GET read-only; POST explicit accept/decline
- expiry/supersede/replay validation inside transaction
- first-valid-acceptance-wins database/application concurrency guard
- exactly one recovered booking + attribution
- competing-offer closure
- Notifications integration with consent/quiet-hours/frequency limits
- outbox + scheduled expiry/retry jobs
- `recoveredBooked` vs `recoveredRealised` and reversal transitions
- workspace/global outbound kill controls
- failure/offline/no-match system states

Testing emphasis: genuine concurrent acceptance, idempotent retries, public-token security, attribution reversal and critical Recovery E2E.

Exit: cancellation → vacancy → ranking → offers → first valid acceptance → recovered booking is idempotent, race-safe, auditable and observable.

## Phase 5 — Payments & Inventory

### Payments

- appointment/client-anchored checkout
- Money/tax/allocation rules
- provider adapter + idempotent command/webhook processing
- processing/additional-action/authorization-capture semantics as required by provider
- paid/receipt
- refund entities supporting partial/full multiple refunds
- void/dispute/failure handling
- deposits/no-show fees as first-class monetary records

### Inventory

- product catalogue linkage
- append-only stock movement ledger
- sale/service-consumption/delivery/damage/manual correction reasons
- low-stock/replenishment workflows

Exit: money allocation conserves totals, provider events cannot double-apply/regress state, refund lifecycle is explicit, and inventory balance reconciles to movements.

## Phase 6 — Staff & Configuration UI

- staff directory/profile
- working patterns/time off/coverage impact feeding Scheduling
- service capability editing through Catalog ownership
- workspace membership/role/permission UI through Identity ownership
- Settings UI composes per-domain configuration rather than owning backend settings tables
- booking/recovery/payment/integration configuration surfaces
- permission-restricted states and audit events

Exit: staff/configuration workflows operate through owning domains with server-authoritative authorization.

## Phase 7 — Retention/Marketing & Analytics

- rebooking/at-risk opportunities
- campaign creation/performance through Clients + Notifications
- attributed booking/revenue definitions
- Analytics event-fed read-model tables/projections
- revenue/recovered/lost revenue analytics
- utilization/service/staff context without simplistic leaderboards
- projection rebuild/backfill path

Exit: Retention remains distinct from Recovery; Analytics never cross-queries operational-domain tables.

## Phase 8 — Cross-product Hardening & Production Readiness

- full system-state parity
- keyboard/focus/touch/Light-Dark/reduced-motion regression
- seven critical Playwright journeys from `docs/testing/strategy.md`
- visual regression for primitives/system states
- performance budgets/load tests for priority paths
- error/degraded/offline exercises
- dependency/security scanning
- backup/restore and incident/runbook drills
- PII retention/erasure/pseudonymization verification
- documentation/spec/ADR synchronization

Exit: no known critical dead ends, tenant/booking/recovery/payment invariants pass under concurrency, operational runbooks are tested, and shipped behavior matches committed specs.

## Dependency order

`Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`

Within a phase, work is split into bounded issues/PRs. Parallelism is allowed only when contracts are stable and PRs remain independently reviewable.

## PR discipline

- current `main` is the base
- one bounded issue/slice per PR
- no unrelated refactors
- architecture-changing decisions require ADR update/approval
- relevant invariant tests are mandatory
- changed interactive UI receives accessibility/reduced-motion verification
- no auto-merge
- founder merges manually
