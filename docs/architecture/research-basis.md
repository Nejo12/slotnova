# Architecture Research Basis

Research checkpoint: 2026-09-08.

This records the external primary-source basis for Phase 0 decisions. It is not a substitute for ADRs; it makes version-sensitive reasoning auditable and refreshable.

## Planning / agent workflow

- GitHub Spec Kit documents the canonical specification sequence and Claude integration: https://github.com/github/spec-kit
- Superpowers documents composable execution skills and Claude Code plugin use: https://github.com/obra/superpowers

Decision: Spec Kit is the durable specification/planning layer; Superpowers is execution discipline. Neither silently overrides committed ADRs/specifications.

## Frontend/runtime

- React official versions: https://react.dev/versions
- Vite releases/blog: https://vite.dev/blog/announcing-vite8
- Node 24 LTS archive/support: https://nodejs.org/en/download/archive/v24

Decision: React 19.2 / Vite 8 / Node 24 LTS are the Phase 0 baseline, with exact patches pinned only after Phase 1 compatibility verification.

## Backend

NestJS documents Fastify as a supported adapter: https://docs.nestjs.com/techniques/performance

Decision: NestJS module structure + Fastify adapter is preferred over unstructured bare Fastify for a large AI-assisted TypeScript codebase. Compatibility with the selected Fastify major is explicitly rechecked before upgrades.

## Database

- PostgreSQL 18 docs: https://www.postgresql.org/docs/18/
- Row security: https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- Range types: https://www.postgresql.org/docs/18/rangetypes.html
- Constraint documentation: https://www.postgresql.org/docs/18/ddl-constraints.html
- `btree_gist`: https://www.postgresql.org/docs/18/btree-gist.html

Decision: PostgreSQL capabilities such as RLS, range/exclusion constraints and real transactional locking are architectural correctness tools, not implementation details.

PostgreSQL 18 is the preferred baseline major **only if the selected managed provider supports it appropriately at Phase 1 bootstrap**. Otherwise select the newest provider-supported PostgreSQL major that preserves required RLS/range/exclusion semantics and record the deviation.

## Browser session security

MDN documents `Secure`, `HttpOnly`, `SameSite` behavior and the `__Host-` cookie prefix restrictions: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie

Decision: primary browser sessions use secure server-managed cookies rather than tokens stored in `localStorage`; final cookie attributes are verified against deployment topology.

## HTTP error contracts

RFC 9457 defines Problem Details for HTTP APIs and obsoletes RFC 7807: https://www.rfc-editor.org/rfc/rfc9457.html

Decision: Slotnova HTTP error responses use an RFC 9457-style problem-details contract.

## Time

Temporal proposal/reference: https://tc39.es/proposal-temporal/

Decision: domain code uses Temporal semantics via a polyfill until native support is intentionally adopted and compatibility verified; raw `Date` is kept outside domain scheduling logic.

## Async jobs

Phase 1 evaluates Postgres-native worker options against official documentation before selection:

- graphile-worker: https://worker.graphile.org/
- pg-boss: https://github.com/timgit/pg-boss

The transactional outbox remains separate from delayed/recurring job scheduling regardless of library choice.

## Refresh policy

Before the Phase 1 bootstrap PR, verify:

- current Node 24 LTS patch / active LTS recommendation
- current compatible pnpm/Turborepo releases
- current React/Vite/React Router compatibility
- current NestJS/Fastify compatibility
- current Drizzle/PostgreSQL compatibility
- selected managed PostgreSQL provider's supported major/features
- current Vitest/Playwright/Storybook/Testcontainers compatibility
- current Temporal polyfill status/native-runtime support
- graphile-worker vs pg-boss compatibility/maintenance/security

Lock exact versions only after that compatibility check. Major-version upgrades later require focused review and, where architectural behavior changes, an ADR update.
