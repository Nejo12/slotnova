# ADR-003 — Frontend Stack

Status: Proposed

## Decision

Use React + strict TypeScript + Vite + React Router, SCSS Modules with semantic CSS variables, TanStack Query for server state, Zustand only for justified cross-route client state, Zod for runtime boundary validation, Motion for React for composed animation, and Storybook for reusable UI/state development.

No Tailwind unless explicitly approved.

## Rationale

The stack keeps the UI close to the existing Figma system, supports typed route/data boundaries, separates server/client state, and avoids utility-class coupling to generated design code.

## Guardrails

- route modules own route-level data orchestration, not business-domain invariants
- shared UI primitives do not import domain services
- semantic tokens drive Light/Dark mode
- animation follows `docs/standards/motion.md`
- avoid global client state when URL/server/local component state is sufficient
