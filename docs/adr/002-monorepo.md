# ADR-002 — pnpm + Turborepo Monorepo

Status: Proposed

## Context

Slotnova will contain a web app, API, worker, Storybook, shared tokens/contracts/testing utilities and potentially more deployables later.

## Decision

Use pnpm workspaces with Turborepo. Keep independently deployable applications under `apps/` and genuinely shared libraries/configuration under `packages/`.

Do not create a package merely to mirror every business domain. Backend bounded contexts remain modules in the API until multiple consumers justify extraction.

## Consequences

Benefits: one dependency graph, shared tooling, cached tasks, atomic contract changes, simpler local onboarding.

Costs: requires package-boundary discipline and CI configuration to avoid every change rebuilding everything.
