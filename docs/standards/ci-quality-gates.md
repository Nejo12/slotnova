# CI Quality Gates

CI exists to make architectural and behavioral expectations mechanical.

## Baseline required checks for implementation PRs

```text
format/check
lint
architecture boundaries
typecheck
unit/property tests
component tests
relevant database/API integration tests
build
a11y checks
relevant Playwright tests
```

Docs-only PRs may use a reduced path-aware workflow.

## Architecture enforcement

Use ESLint/package-boundary rules to prevent forbidden imports such as:

- UI → database/infrastructure
- domain → HTTP/provider SDK
- unrelated bounded context infrastructure cross-imports
- deep imports bypassing package exports

Circular dependency detection should fail CI.

## Dependency/security gates

Before production include:

- dependency vulnerability scanning
- secret scanning
- license review for new dependencies where relevant
- lockfile integrity
- container/image scanning if containers are introduced

## Migration gates

Database migration PRs must include:

- migration file review
- clean-database migration test
- existing-schema forward migration test where practical
- constraints/index implications
- deployment/backfill plan for non-trivial changes

Do not use development schema-push shortcuts against production.

## Merge policy

- no auto-merge
- required checks must be green or explicitly documented as non-applicable
- founder performs final merge
- agents do not bypass branch protection or merge gates

## Performance

Phase 1 establishes build/bundle baselines. Later phases add budgets for route bundles, Core Web Vitals and priority API latency/load paths. Performance regressions should be visible in CI before they become production incidents.
