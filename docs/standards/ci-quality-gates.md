# CI Quality Gates

CI exists to make architecture and behavior mechanical rather than aspirational.

## TypeScript baseline

At minimum:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "verbatimModuleSyntax": true
}
```

Any relaxation requires explanation in the PR and, for project-wide changes, an ADR/update to this standard.

## CI lanes

### Fast lane — target under 3 minutes

Runs on every implementation push/PR update:

```text
format/check
ESLint
Stylelint token/raw-value rules
architecture/dependency boundaries
typecheck
unit/property tests
changed-package component tests
build/type-generation smoke
```

### Heavy lane — required before merge

```text
real PostgreSQL/Testcontainers integration tests
migration tests
API integration tests
Playwright critical/relevant journeys
a11y checks
visual regression where affected
security/dependency scans
```

Use Turborepo local/remote caching from Phase 1 so deterministic unchanged tasks are reused. Heavy tests should be sharded where useful rather than bypassed because they became slow.

## Architecture enforcement

Use `dependency-cruiser` plus ESLint/package exports to fail forbidden dependencies, including:

- UI → database/infrastructure
- domain → HTTP/provider SDK
- module A → module B repository/schema
- deep imports bypassing public module/package exports
- circular dependencies
- server observability packages imported into browser code

Do not rely on directory naming alone.

## Styling/token enforcement

Stylelint should reject raw colors and raw motion durations/easings outside the token definition layer, with narrowly documented exceptions. Light/Dark must remain semantic-token driven.

## Database/migration gates

Migration PRs include:

- reviewed migration file; never production schema-push shortcuts
- clean-database migration test
- forward migration from a populated representative schema where practical
- RLS/tenant-policy coverage checks for tenant-owned tables
- constraint/index implications
- expand/contract/backfill plan for non-trivial schema changes
- rollback/roll-forward strategy

Booking-overlap/RLS/concurrency invariants are tested against real PostgreSQL.

## API/contract gates

- OpenAPI generation is deterministic
- generated client/types are up-to-date
- breaking contract changes are detected/reviewed
- problem+json error contract tests exist for changed endpoints

## Dependency/security gates

- dependency vulnerability scanning
- secret scanning
- license review where relevant
- lockfile integrity
- static/security analysis appropriate to the stack
- container/image scanning if containers are introduced

## Merge policy

- no auto-merge
- required checks must be green or explicitly documented as non-applicable
- founder performs final merge
- agents do not bypass branch protection or merge gates

## Performance

Phase 1 records install/build/test and route-bundle baselines. Later phases add budgets for critical route bundles, Web Vitals and priority API/worker latency/load paths. CI should surface meaningful regressions before production.

## Heavy-lane pre-merge time budget (T089)

**Status: pending founder approval.** No budget value is recorded here yet.
Per the PR-19/T089 founder gate, a budget must not be silently selected —
it is set only after the founder reviews an actual observed heavy-lane
duration from a completed GitHub Actions run and explicitly approves a
number. `tooling/perf/check-heavy-budget.ts` implements the enforcement
mechanism and is ready to wire into `heavy.yml` once a value lands here.
