# ADR-021 — Frontend Feature Structure & State Ownership

Status: Proposed

## Context

A large React codebase becomes hard to reason about when pages, hooks, queries and domain-specific UI are organized only by technical type or pushed into global shared folders.

## Decision

Organize frontend product code primarily by feature/domain surface, with a small explicit shell/platform layer and `packages/ui` for reusable primitives only.

Illustrative shape:

```text
apps/web/src/
  app/              router, providers, shell, auth/workspace composition
  features/
    booking/
    clients/
    recovery/
    payments/
    ...
  lib/              narrow application-wide adapters only
```

Within a feature, colocate route composition, queries/mutations, feature components, schemas and tests. TanStack Query owns server state. URL owns shareable navigation/filter state. Local component state stays local. Zustand is used only for genuinely cross-route client-only workflows that do not belong in URL/server state.

Shared UI primitives contain no product-domain logic. Avoid broad `components/`, `hooks/`, `utils/` dumping grounds and barrel files.

## Consequences

Keeps feature ownership clear, reduces accidental coupling and makes agent-generated changes easier to bound/review.
