# AGENTS.md

## Purpose

This repository implements Slotnova from the approved Figma product system. AI coding agents must preserve approved product behavior, architecture and bounded scope.

## Authority order

1. Current GitHub `main` for merged implementation state.
2. Approved Figma screens and `19 — Implementation Handoff` for product/UI behavior.
3. Accepted ADRs and architecture standards for technical constraints.
4. Linked GitHub issue / committed feature specification for current scope.
5. Explicit founder instruction when it intentionally changes prior decisions.

If these conflict, stop and surface the conflict rather than guessing.

## Pre-implementation rule

No product implementation begins until Phase 0 is approved. See `docs/architecture/phase-0-gate.md`.

For architectural work read at minimum:
- `docs/architecture/overview.md`
- `docs/architecture/domain-modeling.md`
- applicable `docs/adr/*`
- `docs/testing/strategy.md`
- `docs/standards/ci-quality-gates.md`

## Product invariants

- Recovery and retention are different domains.
- Recovery lifecycle is vacancy → value at risk → ranking → offer → waiting → acceptance → close competing offers → booking update → recovered-revenue attribution.
- Mobile navigation is fixed to `Home · Calendar · Clients · Recovery · More` unless explicitly changed by the founder.
- Mobile layouts are intentional substitutions, not compressed desktop layouts.
- Light/Dark must be semantic-token driven.
- Destructive actions need explicit consequence communication and a safe exit path.
- System states must preserve user input where recovery is possible.

## Architecture baseline

- pnpm + Turborepo monorepo
- modular-monolith backend
- React + strict TypeScript + Vite + React Router
- SCSS Modules / semantic CSS variables; no Tailwind unless explicitly approved
- TanStack Query for server state; Zustand only when justified
- NestJS + Fastify adapter
- PostgreSQL + Drizzle
- OpenAPI contract
- Postgres-backed transactional outbox + worker
- provider infrastructure behind typed ports/adapters

Prefer strong domain types, explicit invariants and small modules over broad abstractions.

Do not introduce generic BaseService/BaseRepository/UniversalEntity patterns, microservices, Kafka, or new core frameworks without a concrete need and accepted ADR.

## Domain safety

- tenant-owned data carries explicit workspace ownership
- no timezone-naive booking logic
- no binary floating-point money arithmetic
- critical external side effects require idempotency
- provider SDKs do not appear in domain/application code
- frontend code never talks directly to the database for domain operations

## PR rules

- Start from current `main`.
- One bounded issue per PR.
- Do not mix product redesign with implementation.
- Do not change unrelated files to "clean things up".
- Architectural changes update/create an ADR.
- Add or update tests for behavior changed by the PR.
- Verify keyboard, focus, touch target, reduced-motion and Light/Dark behavior for changed UI.
- Never enable auto-merge.
- Do not merge PRs. Founder merges manually.

## Figma implementation rules

- Reuse existing design-system primitives before creating new UI primitives.
- Preserve approved spacing, hierarchy and state semantics rather than copying generated utility-class code literally.
- Icon-only controls require accessible names.
- Dialogs/Drawers must move focus inside, trap focus while modal, support Escape when dismissal is allowed, and restore focus to the invoking control.
- Interactive mobile targets should be at least 44px in the relevant dimension.
- Motion follows `docs/standards/motion.md` and must respect reduced-motion preferences.

## Testing expectations

Follow `docs/testing/strategy.md`. At minimum for each domain slice:

- happy path
- representative failure/error path
- relevant state-transition/invariant tests
- keyboard/accessibility assertions for changed interactive UI
- regression coverage for bug fixes
- real PostgreSQL integration coverage when transaction/schema behavior is involved

Do not treat visual-only screenshots as a replacement for behavioral tests.
Do not weaken correct tests merely to make a PR pass.
