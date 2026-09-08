# ADR-006 — Testing Architecture

Status: Accepted

## Decision

Use a layered verification strategy:

- Vitest for pure domain/unit tests
- fast-check for invariant-heavy property tests
- Testing Library for UI behavior/accessibility semantics
- MSW for HTTP-boundary mocks, Storybook states and development fixtures
- Testcontainers + real PostgreSQL for RLS, constraints, transactions, locking, migrations, outbox and repository behavior
- Nest API integration tests against real PostgreSQL
- genuine multi-connection concurrency tests for overlap/Recovery/payment/outbox hazards
- Playwright for a small set of critical cross-system journeys
- axe automation plus manual keyboard/focus checks
- Storybook + targeted screenshot regression for stable primitives/system states
- later k6/equivalent load testing for priority production paths

## Critical E2E set

1. create booking
2. cancel booking
3. cancel → Recovery offer → unauthenticated client accepts in a second browser context → one recovered booking exists
4. client rebooking
5. checkout → paid → refund → refunded
6. workspace switch exposes no prior-workspace data
7. restricted-permission user cannot perform the protected action

## Rationale

Slotnova's principal risks are scheduling/tenancy/Recovery races, money, transactions, provider failure and accessibility—not merely rendering. Correctness must therefore be proved at the layer where the invariant actually lives.

## Guardrails

- concurrency tests use independent overlapping connections/tasks; sequential loops are not concurrency tests
- database-specific behavior is never considered proven by mocks
- tests do not depend on production external services
- no arbitrary sleeps
- bug fixes add regression coverage
- critical invariants receive explicit tests regardless of aggregate coverage percentage
- do not test framework/Drizzle internals, getters/setters, exact animation timing or giant DOM snapshots
- avoid tests that only assert mocked repository call order rather than observable behavior
- never weaken a correct test merely to make a PR green
