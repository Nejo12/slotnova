# Slotnova Implementation Plan

Slotnova is intentionally specification-led. Product implementation does **not** start immediately after repository creation. Phase 0 establishes architecture, agent workflow and verification rules that later feature PRs must obey.

## Phase 0 — Architecture & Engineering Foundation

Status: in progress in PR #10.

### Deliverables

- modular-monolith architecture
- pnpm/Turborepo monorepo plan
- frontend/backend/data ADRs
- bounded-context/domain map
- tenancy, time and money conventions
- API/provider boundary rules
- transactional outbox/worker strategy
- security/audit baseline
- observability baseline
- testing architecture
- motion/accessibility standard
- Claude Code project instructions
- Spec Kit + Superpowers operating model
- independent architecture critique and reconciliation
- CI quality-gate design

### Exit gate

All required items in `docs/architecture/phase-0-gate.md` are approved. PR #10 is merged manually by the founder only after the gate is satisfied.

---

## Phase 1 — Platform Foundation & Shell

- initialize pnpm workspace + Turborepo
- `apps/web`, `apps/api`, `apps/worker`, `apps/storybook`
- shared TypeScript/ESLint/test configuration packages
- React/Vite/Router shell
- Nest/Fastify API shell
- PostgreSQL/Drizzle migration harness
- semantic design tokens and SCSS Modules foundation
- Storybook
- Light/Dark infrastructure
- desktop/mobile navigation shells
- OpenAPI generation path
- structured logging/request IDs
- Vitest/MSW/Testcontainers/Playwright base harness
- architecture-boundary linting
- baseline GitHub Actions quality gates

Exit: repository builds/tests from a clean checkout; shell works desktop/mobile; API health path and database integration test pass; CI enforces architecture/type/test/build gates.

## Phase 2 — Calendar & Booking

- calendar navigation/views
- availability boundaries
- booking list/detail/create/review
- cancellation/destructive confirmation
- system states
- booking state-machine tests
- DST/overlap property tests

Exit: booking draft → review → created/confirmed and cancellation flows are behaviorally complete and tested.

## Phase 3 — Clients & Messaging

- client directory/detail/create
- relationship-health context
- rebooking entry points
- messaging inbox/thread/new message
- messaging provider port
- failure/retry/empty states

Exit: clients can be found, opened, messaged and rebooked through typed boundaries.

## Phase 4 — Recovery Engine

- vacancy/value-at-risk model
- candidate ranking contract
- offer lifecycle
- first-valid-acceptance-wins concurrency rule
- competing-offer closure
- booking/calendar/client-history update
- recovered-revenue attribution
- outbox/worker delivery
- failure/offline/no-match states

Exit: cancellation → vacancy → ranking → offers → acceptance → recovered booking is idempotent, race-tested and observable.

## Phase 5 — Payments & Inventory

- appointment/client anchored checkout
- payment provider adapter
- processing/paid/receipt/refund/refunded lifecycle
- webhook/idempotency handling
- product catalogue
- stock movement ledger/reasons
- low-stock/replenishment workflows

Exit: money invariants, refund lifecycle and stock mutation transactions are tested against real PostgreSQL.

## Phase 6 — Staff & Settings

- staff directory/profile
- working hours/availability/time off
- service capability
- workspace membership/roles/permissions UI
- business/location/services settings
- booking/recovery configuration
- payments/integrations/access settings
- permission-restricted states

Exit: operational staff/settings workflows function with server-authoritative authorization and audit events.

## Phase 7 — Growth & Analytics

- retention/rebooking opportunities
- campaign creation/performance
- attributed bookings/revenue
- revenue/recovered/lost revenue analytics
- utilization and service/staff context
- actionable mobile insight summaries

Exit: Retention remains distinct from Recovery and analytics use canonical domain data/definitions.

## Phase 8 — Cross-product Hardening

- system-state parity
- full keyboard/focus/touch regression
- Light/Dark and reduced-motion regression
- critical-journey Playwright coverage
- visual regression
- performance budgets/load tests for priority paths
- failure/degraded-mode exercises
- dependency/security scanning
- backup/restore and operational runbooks before production

Exit: no known critical dead ends or architectural violations; product docs match shipped behavior.

## Dependency order

`Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`

Individual domain issues should still be split into bounded PRs. Parallelism is allowed only where contracts are stable and changes remain independently reviewable.

## PR discipline

- current `main` is the base
- one bounded issue/slice per PR
- no unrelated refactors
- architecture-changing decisions require ADR update/approval
- relevant tests are required
- changed interactive UI receives accessibility verification
- no auto-merge
- founder merges manually
