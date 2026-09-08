# Architecture Overview

## Architectural style

Slotnova starts as a **modular monolith** in a **pnpm workspace / Turborepo monorepo**. This keeps deployment and transactions simple while enforcing domain boundaries strongly enough to support later extraction only when scale or organizational evidence justifies it.

Microservices are not the default. Extraction requires evidence and an ADR.

## Proposed monorepo

```text
apps/
  web/        React operator application
  api/        NestJS + Fastify modular-monolith API
  worker/     durable background jobs and outbox consumers
packages/
  ui/                    reusable UI primitives + Storybook
  design-tokens/         generated semantic design/motion tokens
  contracts/             generated external API client/types only
  db/                    database client, migration runner, test harness
  testing/               shared test builders/fixtures
  observability-browser/ browser telemetry helpers
  observability-server/  server/worker telemetry helpers
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

Storybook belongs with `packages/ui`; it is not a deployable application. Business domains do **not** become workspace packages by default. Backend domains live inside `apps/api/src/modules/*` until multiple real consumers justify promotion.

Do not create generic `common`, `core`, `shared`, `utils`, `helpers`, `types`, `constants` or wrapper packages as dumping grounds. Prefer local ownership and the rule of three before abstraction.

## Final domain/module map

### Core domains — full domain/application/infrastructure/http layering

- **Scheduling** — availability algebra, recurring working patterns, time off, buffers, blocking intervals and overlap invariants
- **Booking** — booking aggregate, lifecycle, cancellation/no-show rules and booking consistency
- **Recovery** — vacancy/offer state machines, ranking, orchestration/process manager and recovered-revenue attribution
- **Payments** — payments, refunds, deposits, tax/discount/tip calculation and reconciliation

### Supporting domains — lighter application/infrastructure/http structure; add domain layer only where invariants justify it

- **Identity** — users, workspaces, locations, memberships, invitations, roles and permissions
- **Catalog** — services, categories, duration, buffers, price, add-ons and staff-service capability
- **Clients** — client records, contact preferences, consent, quiet hours, frequency limits, history and future dedupe/merge
- **Staff** — staff profiles, employment/operating data and working-pattern ownership consumed by Scheduling
- **Messaging** — human conversation threads
- **Notifications** — system-initiated templated sends, delivery records, throttling and provider adapters
- **Inventory** — products and append-only stock movements
- **Marketing / Retention** — rebooking/win-back orchestration built on Clients, Notifications and Analytics read models

### Generic/platform capabilities — deliberately thin

- **Audit** — append-only security/business audit records
- **Analytics** — event-fed read models with their own tables; never cross-query another domain's tables directly
- **Platform infrastructure** — tenancy context, outbox, jobs, telemetry, feature flags and provider composition

### UI surfaces that are not backend bounded contexts

- **Calendar** — frontend view over Scheduling + Booking
- **Settings** — frontend composition over configuration owned by the relevant domains
- **Dashboard** — frontend/read-model composition

## Module tiering rule

Full DDD ceremony is reserved for invariant-heavy core domains. Supporting modules must not receive aggregates/value-object/repository abstractions unless they protect real business invariants. Generic modules stay thin. This is an explicit defense against AI-generated architecture bloat.

## Cross-context dependency rule

Cross-context behavior goes through application ports/contracts. A module must never import another module's repository or access another module's tables directly. Recovery is intentionally a process manager coordinating Booking, Scheduling, Catalog, Clients and Notifications through ports.

## Frontend baseline

- React + TypeScript
- Vite SPA
- React Router data router (`createBrowserRouter`); loaders/actions are for route gating/prefetch/navigation concerns, not a second server-state cache
- TanStack Query owns remote/server state
- query keys are workspace-scoped: `['ws', workspaceId, ...]`
- clear the QueryClient on logout and workspace switch
- Zustand only for justified client-only cross-route state
- SCSS Modules + semantic CSS custom properties
- Zod at runtime boundaries
- CSS transitions for simple state changes
- View Transitions for route transitions where supported
- Motion for React only for richer presence/layout/sheet/drawer transitions and code-split where practical
- Storybook colocated with `packages/ui`

No Tailwind unless explicitly approved by the founder.

## Backend baseline

- Node.js LTS
- NestJS with Fastify adapter
- PostgreSQL
- Drizzle for typed access and reviewed migrations
- per-module Drizzle schema ownership under each module's infrastructure layer; `packages/db` does not own all business tables
- OpenAPI is the external HTTP contract
- request/response validation schemas live at API boundaries and generate OpenAPI; client/types/MSW artifacts are generated into `packages/contracts`
- RFC 9457-style `application/problem+json` errors
- transactional outbox for reliable event publication
- Postgres-backed job scheduler/worker for delayed/recurring/retryable work; scheduler and outbox are separate concerns

## Provider boundaries

Authentication, persistence, payments, messaging/notifications, external calendars, files and observability vendors sit behind intentional adapters. Domain/UI code must not import provider SDKs directly.

## Architectural quality gates

- no deep imports across bounded contexts
- no circular domain dependencies
- no cross-context repository/table access
- no frontend-to-database access
- no float-based money arithmetic
- no raw JavaScript `Date` in domain scheduling code
- no timezone-naive appointment logic
- no tenant-owned table without database-enforced tenant isolation
- no booking overlap protection that relies only on check-then-insert
- no non-idempotent external side effect without an idempotency strategy
- no HTTP GET endpoint with a state-changing side effect
- no user-facing status represented by color alone

Violations should be mechanically detectable through linting, database policies/constraints, package exports, tests or CI wherever practical.
