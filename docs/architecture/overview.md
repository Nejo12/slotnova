# Architecture Overview

## Architectural style

Slotnova starts as a **modular monolith** in a **pnpm workspace / Turborepo monorepo**. This gives one deployable product architecture while enforcing bounded contexts strongly enough to support future extraction if scale or organizational constraints justify it.

Microservices are not the default. Extraction requires evidence and an ADR.

## Proposed monorepo

```text
apps/
  web/        React application
  api/        NestJS API
  worker/     background jobs / outbox consumers
  storybook/  UI development and visual-state harness
packages/
  ui/               approved reusable UI primitives
  design-tokens/    semantic design/motion tokens
  contracts/        generated/public API contracts only
  db/               schema, migrations, database test utilities
  testing/          shared test builders/fixtures
  observability/    logging/tracing helpers
  eslint-config/
  tsconfig/
docs/
  architecture/
  adr/
  testing/
  standards/
  security/
  observability/
```

Do not turn every business domain into a package immediately. Backend domains live inside `apps/api/src/modules/*` until multiple real consumers justify promotion.

## Backend modules

Initial bounded contexts:

- Identity / Workspace
- Calendar / Availability
- Booking
- Clients
- Recovery
- Messaging
- Payments
- Inventory
- Staff
- Marketing / Retention
- Analytics
- Settings
- Audit

Each substantial module should separate:

```text
domain/          entities, value objects, invariants, domain events
application/     use cases / commands / queries / ports
infrastructure/  persistence and provider adapters
http/            controllers / transport DTO mapping
tests/
```

Dependencies point inward. Domain code must not depend on HTTP, database drivers, provider SDKs, or React.

## Frontend baseline

- React
- TypeScript with strict configuration
- Vite
- React Router data/framework capabilities where useful
- SCSS Modules + semantic CSS custom properties
- TanStack Query for server state
- Zustand only for justified cross-route client state
- Zod for runtime boundary validation
- Motion for React + CSS + View Transitions API according to `docs/standards/motion.md`
- Storybook for reusable UI/state coverage

No Tailwind unless explicitly approved by the founder.

## Backend baseline

- Node.js LTS
- NestJS with Fastify adapter
- PostgreSQL
- Drizzle for typed database access and reviewed migrations
- OpenAPI as the external HTTP contract
- durable Postgres-backed outbox + worker for asynchronous side effects

## Provider boundaries

Persistence, authentication, messaging, payments, external calendars, files and observability vendors must sit behind intentional adapter boundaries. UI/domain code must not import provider SDKs directly.

## Architectural quality gates

- no deep imports across bounded contexts
- no circular domain dependencies
- no frontend-to-database access
- no shared mutable domain state
- no float-based money arithmetic
- no timezone-naive appointment logic
- no tenant-owned record without workspace ownership
- no non-idempotent external side effect without an idempotency strategy

Violations should be made mechanically detectable through linting, package exports, tests or CI wherever practical.
