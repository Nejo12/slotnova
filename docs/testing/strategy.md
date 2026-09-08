# Testing Strategy

Testing is part of architecture, not a final hardening activity.

## Test layers

### 1. Domain/unit — Vitest
Fast tests for pure rules and state transitions.

Priority: scheduling interval algebra, booking lifecycle, permissions, Recovery state machines/ranking, money allocation, inventory ledger rules.

### 2. Property-based — fast-check
Use for invariant-heavy logic where examples are insufficient:

- timezone/DST and recurrence expansion
- interval/availability algebra
- deterministic Recovery ranking and illegal transition generation
- money allocation/tax/refund conservation
- inventory balance invariants

### 3. Component — Testing Library + Vitest
Test user-visible behavior, keyboard semantics and accessibility; avoid private implementation details.

### 4. API mocking — MSW
Use shared/generated handlers for component tests, Storybook edge states and development fixtures. Do not use MSW as evidence for database correctness.

### 5. Database integration — Testcontainers + real PostgreSQL
Required for migrations, RLS policies, exclusion constraints, transactions, locking, indexes, outbox claiming, repository behavior and webhook/idempotency persistence.

Use transaction rollback for fast independent tests where possible. Tests that require real commits (concurrency/locking/constraint interactions) use isolated schemas/databases or controlled truncation.

### 6. Concurrency
Concurrency tests use genuinely separate database connections/tasks synchronized to overlap in time; sequential loops are not concurrency tests.

Required examples:

- two operators attempt the same staff/time booking → exactly one succeeds
- N Recovery clients accept the same vacancy concurrently → exactly one accepted offer, one recovered booking, one attribution
- duplicate/out-of-order payment webhooks do not regress or double-apply state
- outbox/job claims are not double-processed under concurrent workers

### 7. API integration
Run Nest slices against real PostgreSQL. Provider SDKs remain mocked behind ports for normal CI, with narrow provider contract/sandbox smoke tests separately.

Tenant isolation is tested systematically: workspace A must not read/mutate workspace B resources, and every tenant-owned table must have RLS/policies.

### 8. End-to-end — Playwright
Keep the core E2E set small and high-value:

1. create booking
2. cancel booking
3. cancel → Recovery offer → unauthenticated client accepts in a second browser context → recovered booking exists
4. client rebooking
5. checkout → paid → refund → refunded
6. workspace switch shows no previous-workspace data
7. restricted-permission user sees the restricted state and cannot perform the action server-side

Additional feature journeys are added only when they protect a real integration seam.

### 9. Accessibility — axe + manual keyboard checks
Automated axe checks are required but do not replace manual keyboard/focus testing for changed interactive flows. Dialog/drawer focus trap, Escape behavior and focus restoration require behavioral tests.

### 10. Visual regression
Use Storybook for stable primitives/system states and targeted Playwright screenshots. Do not snapshot entire route DOMs or use screenshots as the only behavioral verification.

### 11. Performance
Establish build/bundle/test baselines in Phase 1. Add k6 or equivalent when representative endpoints/data volumes exist. Priority load paths: availability search, booking writes, Recovery ranking/acceptance, checkout and analytics reads.

## What not to test

Do not spend tests on framework internals, Drizzle internals, third-party component internals, getters/setters, exact animation timing or broad DOM snapshots. Avoid application-service tests whose only assertion is which mocked repository method was called; prefer observable behavior and invariants.

## Test quality rules

- requirements/invariants over implementation trivia
- bug fixes require regression coverage
- no arbitrary sleeps
- builders/factories over giant shared mutable fixtures
- ordinary CI makes no real external-provider calls
- flaky tests are defects; quarantine is temporary/documented
- never weaken a correct test merely to make a PR green
- coverage percentage is diagnostic, not the goal

## CI

See `docs/standards/ci-quality-gates.md` for fast/heavy lanes and required gates.
