# Slotnova Implementation Plan

This plan converts the approved Figma product corpus into dependency-ordered engineering work. Each batch should be split into bounded issues/PRs rather than implemented as one oversized change.

## Batch 1 — Foundations & shell

- Vite + React + TypeScript bootstrap
- routing
- SCSS foundations and semantic tokens
- desktop shell/navigation
- mobile shell + fixed bottom navigation
- Light/Dark infrastructure
- shared primitives wiring
- test harness

Exit criteria: app shell works on desktop/mobile, semantic modes work, routing is in place, tests run in CI/local workflow.

## Batch 2 — Calendar & Booking

- calendar views/navigation
- booking list/detail
- create booking
- review/create lifecycle
- booking system states
- destructive cancellation confirmation

Exit criteria: booking draft → review → created flow is implemented and tested.

## Batch 3 — Clients & Messaging

- client directory/detail/create
- relationship health context
- messaging inbox/thread/new message
- client context linking
- empty/failure states

Exit criteria: client can be found, opened, messaged and rebooked through typed domain boundaries.

## Batch 4 — Recovery engine

- vacancy model
- value-at-risk calculation boundary
- ranked candidates
- offer lifecycle
- first-acceptance-wins behavior
- competing-offer closure
- booking/calendar update
- recovered-revenue attribution
- recovery failure/offline states

Exit criteria: cancellation → recovery → acceptance → recovered booking is behaviorally complete and tested as a state machine.

## Batch 5 — Payments & Inventory

- appointment/client anchored checkout
- payment processing state boundary
- receipt/refund lifecycle
- product catalogue
- stock movement reasons
- low-stock/replenishment flows

Exit criteria: checkout → paid → refund and stock mutation workflows are implemented with failure handling.

## Batch 6 — Staff & Settings

- staff directory/profile
- working hours/availability/time off
- service assignment
- roles/permissions UI
- business/services settings
- booking/recovery configuration
- payments/integrations/access settings

Exit criteria: operational staff and configuration workflows are available with permission-restricted states.

## Batch 7 — Growth & Analytics

- retention opportunities
- campaign creation/performance
- revenue/recovery/loss analytics
- utilization
- staff/service performance context
- actionable insights

Exit criteria: retention and analytics remain distinct from Recovery while sharing canonical client/business data.

## Batch 8 — Hardening & prototypes

- full system-state coverage
- accessibility/focus regression
- responsive regression
- Light/Dark regression
- critical journey e2e tests
- performance and error-boundary review
- documentation synchronization

Exit criteria: core desktop/mobile journeys pass automated and manual regression without known critical accessibility/state defects.

## Dependency order

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`

Parallel work is allowed only when domain contracts are already stable and PRs remain independently reviewable.

## Infrastructure decisions

Do not prematurely couple UI/domain code to specific providers. Use typed adapters/interfaces for persistence, auth, payments, messaging and external calendar/integration providers until each provider is intentionally selected.

## PR discipline

- one bounded issue per PR
- current `main` as base
- no unrelated refactors
- tests for changed state transitions
- accessibility verification for changed UI
- no auto-merge
- founder manually merges
