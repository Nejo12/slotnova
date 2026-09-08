# ADR-002 — pnpm + Turborepo Monorepo

Status: Accepted

## Context

Slotnova will contain multiple deployables plus shared UI/tokens/contracts/testing/configuration. Business domains still need clear ownership without becoming a package-per-domain architecture.

## Decision

Use pnpm workspaces with Turborepo.

Deployables live under `apps/`:

```text
apps/web
apps/api
apps/worker
```

Genuinely shared/reusable tooling lives under `packages/`, including `ui` (with Storybook colocated), `design-tokens`, generated `contracts`, database client/migration/test harness, testing helpers, browser/server observability and config packages.

Do not create workspace packages merely to mirror business domains. Backend bounded contexts remain modules under `apps/api/src/modules/*` until multiple real consumers justify extraction.

Do not create generic `common`, `shared`, `core`, `utils`, `helpers`, `types`, `constants` or single-dependency wrapper packages as dumping grounds. Apply the rule of three before extraction.

## Consequences

Benefits: one dependency graph, cached tasks, atomic contract/tooling changes, simple local onboarding and explicit deployables.

Costs: requires package/module-boundary enforcement and Turborepo-aware CI/caching. Shared-package growth must be reviewed aggressively to prevent a monorepo-wide coupling layer.
