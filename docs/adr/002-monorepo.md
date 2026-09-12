# ADR-002 — pnpm + Turborepo Monorepo

Status: Accepted

> **Amended by ADR-025 (2026-09-12):** Slotnova no longer owns local `packages/ui` and `packages/design-tokens` implementations. It consumes the published Nova design-system packages instead. All other monorepo and package-boundary rules in this ADR remain in force.

## Context

Slotnova will contain multiple deployables plus shared contracts/testing/configuration. Business domains still need clear ownership without becoming a package-per-domain architecture.

## Decision

Use pnpm workspaces with Turborepo.

Deployables live under `apps/`:

```text
apps/web
apps/api
apps/worker
```

Genuinely shared/reusable Slotnova-owned tooling lives under `packages/`, including generated `contracts`, database client/migration/test harness, testing helpers, browser/server observability and config packages.

UI primitives and shared design-system tokens are consumed from the published Nova packages defined by ADR-025 rather than duplicated as Slotnova-local workspace packages.

Do not create workspace packages merely to mirror business domains. Backend bounded contexts remain modules under `apps/api/src/modules/*` until multiple real consumers justify extraction.

Do not create generic `common`, `shared`, `core`, `utils`, `helpers`, `types`, `constants` or single-dependency wrapper packages as dumping grounds. Apply the rule of three before extraction.

## Consequences

Benefits: one dependency graph, cached tasks, atomic contract/tooling changes, simple local onboarding and explicit deployables. Shared design-system ownership is centralized in Nova-UI rather than duplicated per product.

Costs: requires package/module-boundary enforcement and Turborepo-aware CI/caching. Shared-package growth must be reviewed aggressively to prevent a monorepo-wide coupling layer. External Nova package upgrades require explicit version review and compatibility verification per ADR-025.
