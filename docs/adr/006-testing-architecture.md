# ADR-006 — Testing Architecture

Status: Proposed

## Decision

Use a layered testing strategy:

- Vitest for domain/unit tests
- fast-check for invariant-heavy property tests
- Testing Library for components
- MSW for API boundary mocking
- Testcontainers with real PostgreSQL for repository/integration tests
- API integration tests against Nest + real PostgreSQL
- Playwright for critical user journeys
- axe integration plus manual keyboard/focus checks
- Storybook + targeted screenshot regression for stable UI states

## Rationale

Slotnova's main risks are not only rendering bugs; they include scheduling, tenancy, recovery race conditions, money, transactions, provider failure and accessibility. These require multiple verification layers.

## Guardrails

- tests must not depend on external production services
- no arbitrary sleeps
- bug fixes include regression tests
- critical invariants receive explicit tests regardless of aggregate coverage percentage
- CI should be path-aware but must not skip a relevant verification layer
