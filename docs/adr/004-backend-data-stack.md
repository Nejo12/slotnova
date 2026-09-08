# ADR-004 — Backend & Data Stack

Status: Accepted

## Decision

Use the current Node.js LTS line, NestJS with Fastify adapter, PostgreSQL and Drizzle. OpenAPI is the external HTTP contract generated from runtime request/response boundary schemas.

Business-table schema ownership is colocated with each backend module's infrastructure layer. `packages/db` owns only shared database client/configuration, migration orchestration and test harnesses; it does not centralize every domain table.

Provider services such as identity credentials, payments, notifications, files and external calendars remain behind typed adapters.

## Rationale

NestJS gives an opinionated module/composition structure that is especially valuable in a large AI-assisted TypeScript codebase. Fastify supplies the HTTP adapter. PostgreSQL provides the transactional, RLS, range/exclusion, locking and constraint capabilities required by tenancy, scheduling, Recovery, payments and inventory. Drizzle keeps SQL/query behavior explicit while retaining strong typing.

## Guardrails

- reviewed migration files; no production schema-push shortcuts
- no direct browser-to-database domain access
- no provider SDK imports in domain/application code
- explicit transaction boundaries for multi-record invariants
- PostgreSQL RLS for tenant-owned tables
- overlap/uniqueness/idempotency invariants use database constraints where practical
- module A cannot import module B's schema/repository directly
- expand/contract migration policy for non-trivial production changes
- generated API/client artifacts never become the domain model

## Known risk

Nest's Fastify adapter can lag the newest Fastify major. Runtime/framework version upgrades therefore require compatibility verification rather than automatic major-version adoption.
