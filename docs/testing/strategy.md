# Testing Strategy

Testing is part of architecture, not a final hardening activity.

## Test layers

### 1. Domain/unit — Vitest
Fast tests for pure rules and state transitions.

Priority areas: scheduling, booking lifecycle, permissions, recovery matching/acceptance, money, inventory movements, analytics calculations.

### 2. Property-based — fast-check
Use for invariant-heavy logic where example tests are insufficient:
- timezone/DST boundaries
- slot overlap and availability
- recovery ranking/acceptance invariants
- money/refund arithmetic
- inventory mutation invariants

### 3. Component — Testing Library + Vitest
Test user-visible behavior and accessibility semantics; avoid testing implementation internals.

### 4. API mocking — MSW
Use shared handlers for component tests, Storybook edge states and development fixtures.

### 5. Database integration — Testcontainers + real PostgreSQL
Validate migrations, constraints, transactions, locking, indexes and repository behavior against a disposable real database.

### 6. API integration
Run Nest application slices against real PostgreSQL. Provider integrations remain mocked at typed adapter boundaries unless an explicit contract/integration test is required.

### 7. End-to-end — Playwright
Critical journeys:
- create booking
- cancel booking
- cancel → recovery → acceptance → recovered booking
- client rebooking
- message client
- checkout → paid → refund → refunded
- staff time off / coverage impact

### 8. Accessibility — axe + manual keyboard checks
Automated checks are required but do not replace manual keyboard/focus testing for changed interactive flows.

### 9. Visual regression
Use Storybook states plus targeted Playwright screenshots for stable, high-value UI states. Do not make pixel screenshots the only verification of behavior.

### 10. Performance
Add k6 or equivalent when real endpoints/data volumes exist. Establish budgets before load becomes a production problem.

## CI gates

A normal implementation PR should be able to run, as applicable:

```text
format/check
lint
architecture-boundary lint
typecheck
unit/property tests
component tests
database/API integration tests
build
a11y checks
relevant Playwright journey(s)
```

Do not run every expensive suite for every trivial docs-only change; use path-aware CI where practical.

## Test quality rules

- tests verify requirements and invariants, not private implementation details
- bug fixes require regression coverage
- no arbitrary sleeps in async tests
- fixtures use builders/factories, not giant shared mutable objects
- no real external provider calls in ordinary CI
- flaky tests are defects; quarantine is temporary and documented
- never weaken a correct test merely to make a PR green

## Coverage

Coverage percentage is a diagnostic, not the objective. Critical domain invariants require explicit tests even when line coverage is already high.
