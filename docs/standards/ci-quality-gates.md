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

**Founder-approved: 180 seconds (3 minutes).**

Approved against the observed `heavy.yml` GitHub Actions run on PR #53
(head `218cf73095d5ef21c1da27ea4a973c9151f023bf`): 93 seconds wall-clock
(run `35119891244`, 2026-09-16T16:07:44Z–2026-09-16T16:09:17Z). See
`docs/runbooks/perf-baselines.md` for the full observed-baseline record.

Enforced by `tooling/perf/check-heavy-budget.ts`, invoked from a
`budget-check` job in `heavy.yml` that runs only after every other heavy-lane
job has completed and queries the GitHub Actions API for the current
workflow run's own `run_started_at` to compute real elapsed wall-clock
time — not a hard-coded number, and not any single parallel job's own
duration standing in for the workflow's total.

**This is a Phase-1 baseline budget, not a permanent ceiling.** It reflects
the heavy lane's current job set (`migration-checklist`, `migration-proof`,
`visual-regression`, `accessibility`, `security-scan-reference`). If the
heavy lane's architecture or test scope materially changes — a new required
job, a substantially heavier existing job, more Playwright journeys or
visual-regression baselines, larger real-PostgreSQL suites — this budget
must be deliberately revisited and re-approved by the founder. Do not widen
or silently ignore this number to accommodate scope growth.
