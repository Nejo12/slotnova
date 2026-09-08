# ADR-004 — Backend and Data Stack

Status: Proposed

## Decision

Use the current Node.js LTS line, NestJS with Fastify adapter, PostgreSQL, Drizzle for typed database access/migrations, and OpenAPI for the HTTP contract.

Provider services such as auth, payments, messaging, storage and external calendars remain behind typed adapters.

## Rationale

NestJS provides explicit module boundaries and dependency injection for a large TypeScript codebase; Fastify provides an efficient HTTP adapter. PostgreSQL offers mature transactional behavior needed by bookings, recovery, payments and inventory. Drizzle keeps query/migration behavior close to SQL while preserving TypeScript typing.

## Guardrails

- reviewed migration files for production schema changes
- no direct browser-to-database domain access
- no provider SDK imports in domain/application code
- explicit transaction boundaries for multi-record invariants
- production migrations are forward-reviewed and rollback/recovery aware
