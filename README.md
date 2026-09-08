# Slotnova

Slotnova is a large appointment-business operating platform for service businesses, combining scheduling, booking, clients, waitlist/recovery, notifications/messaging, payments/POS, inventory, staff operations, retention/marketing, analytics and configuration around one operating model.

## Source of truth

For agents and engineers:

1. current GitHub `main` + founder-approved decisions
2. accepted ADRs / committed architecture + product specifications
3. approved Figma for visual/interaction detail
4. linked feature specification / GitHub issue

Figma: https://www.figma.com/design/WDH7Ku5JXhUQeJ054GFLPd

- `18 — Prototypes`: `3:21`
- `19 — Implementation Handoff`: `372:2`

Some generic Figma metadata/API surfaces expose only the cover page. The Figma Plugin API has verified the full 61-page corpus. If your tooling cannot access a referenced design, use `docs/product-handoff.md` and surface visual ambiguity; do not invent the UI.

## Architecture baseline

Slotnova starts as a **modular monolith** inside a **pnpm + Turborepo monorepo**.

### Frontend

- React + strict TypeScript
- Vite SPA
- React Router data router
- TanStack Query for server state
- Zustand only for justified client-only cross-route state
- SCSS Modules + semantic generated design tokens
- CSS + View Transitions + Motion according to the motion standard
- Storybook colocated with `packages/ui`

### Backend / data

- Node.js LTS
- NestJS + Fastify adapter
- PostgreSQL + Drizzle
- PostgreSQL RLS for tenant isolation
- per-module schema ownership
- secure server-managed sessions
- OpenAPI generated from runtime HTTP boundary schemas; generated client artifacts only
- transactional outbox + separate Postgres-backed job scheduler

### Core backend domains

- Scheduling
- Booking
- Recovery
- Payments

Supporting ownership includes Identity, Catalog, Clients, Staff, Messaging, Notifications, Inventory and Marketing/Retention. Analytics is an event-fed read model. Calendar and Settings are product/UI surfaces, not backend bounded contexts.

## Product invariants

- Recovery is distinct from Retention.
- first valid Recovery acceptance wins; competing offers close; recovered attribution is exactly-once.
- `recoveredBooked` and `recoveredRealised` are distinct concepts.
- money uses integer minor units + explicit currency.
- scheduling uses explicit timezone-aware temporal concepts and half-open intervals.
- tenant isolation is database-enforced, not merely conventional.
- booking overlap correctness is enforced in PostgreSQL.
- public offer links never mutate state on GET.
- mobile uses `Home · Calendar · Clients · Recovery · More`.
- Light/Dark uses semantic tokens and motion respects reduced-motion preference.
- accessibility is a release requirement.

## Before implementation

**Phase 0 must be approved first.**

See:

- `.specify/memory/constitution.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/architecture/overview.md`
- `docs/architecture/domain-modeling.md`
- `docs/architecture/phase-0-gate.md`
- `docs/architecture/phase-0-review-reconciliation.md`
- `docs/adr/`
- `docs/testing/strategy.md`
- `docs/standards/ci-quality-gates.md`
- `docs/implementation-plan.md`

## Delivery workflow

- current `main` is the implementation base
- one bounded issue/slice per PR
- architecture changes require ADR review
- changed invariants require tests at the lowest trustworthy layer
- no unrelated refactors in feature PRs
- no auto-merge
- founder manually merges PRs
