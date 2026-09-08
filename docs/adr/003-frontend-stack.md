# ADR-003 — Frontend Stack

Status: Proposed

## Decision

Use React + strict TypeScript + Vite as a client-side SPA, with React Router's data router (`createBrowserRouter`) for routing, route gating and navigation/prefetch concerns. TanStack Query is the single owner of remote/server state; do not dual-source the same server data through both route loaders and Query. Use Zustand only for justified cross-route client state, Zod for runtime boundaries, SCSS Modules with semantic CSS variables, and Storybook colocated with `packages/ui`.

Animation responsibility is layered:

- CSS for simple interaction/state transitions
- View Transitions API for supported route transitions
- Motion for React for richer presence/layout/sheet/drawer transitions, introduced/code-split only where it earns its bundle cost

No Tailwind unless explicitly approved.

## Guardrails

- route modules own route-level orchestration, not business invariants
- shared UI primitives do not import domain services
- semantic tokens drive Light/Dark mode
- query keys are workspace-scoped: `['ws', workspaceId, ...]`
- clear the QueryClient on logout and workspace switch
- animation follows `docs/standards/motion.md` and `prefers-reduced-motion`
- avoid global client state when URL/server/local component state is sufficient
- do not create barrel-file re-export layers that obscure dependencies or create cycles

## Rationale

For an authenticated operator application, SPA/data-router architecture avoids SSR complexity with little product benefit while preserving route-level code splitting and predictable server-state ownership.
