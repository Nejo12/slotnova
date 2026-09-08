# `@slotnova/db`

Database **infrastructure only** (ADR-004, tasks T009–T012 of
`specs/001-platform-foundation-shell/tasks.md`):

- provider-neutral PostgreSQL **client factory** (`createPool`, `createDirectClient`)
- the **gated migration runner** + `schema_migrations` bookkeeping
- the real-PostgreSQL **test harness** (`@slotnova/db/testing`)

This package owns exactly one table — `schema_migrations` — and **no** business
or domain schema. Per-module Drizzle schema lives in each backend module's
`infrastructure/` layer; a module never imports another module's schema, and no
module owns `schema_migrations`.

## Entry points

| Import | Contains | Notes |
|---|---|---|
| `@slotnova/db` | config, client factory, migration runner | safe for application code |
| `@slotnova/db/testing` | Testcontainers harness, tx-rollback / isolation helpers, migration + RLS assertions | test code only — pulls in `testcontainers` |

## Roles (never mixed)

| Role | Env var | Privileges | Used by |
|---|---|---|---|
| `app` | `DATABASE_URL` | RLS-subject: **never** `BYPASSRLS`, never superuser | every request/job path |
| `migration` | `DATABASE_MIGRATION_URL` | privileged (DDL) | `pnpm db:migrate` and migration test helpers only |

`assertNonBypassRlsRole()` is a runtime guard that a connection is a legitimate
RLS subject; call it against the `app` pool in readiness checks and tests.

### Configuration (provider-neutral)

`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `DATABASE_SSL` (`disable|require|no-verify`),
`DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`,
`DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_APP_NAME`. No managed-provider choice
is encoded here (FR-065 is a later founder decision).

## Migrations

```bash
pnpm db:migrate            # apply pending migrations (privileged role)
pnpm db:migrate --dry-run  # list pending migrations
pnpm db:migrate --to 0007  # apply up to a version (inclusive)
```

Migrations are an **explicit gated step** (ADR-020, FR-060). The runner is never
imported by `apps/api` / `apps/worker`, so schema changes cannot be applied as an
application-startup side effect. See [`migrations/README.md`](./migrations/README.md)
for the file convention.

## Real-PostgreSQL tests

```bash
pnpm --filter @slotnova/db test:integration   # requires Docker/Podman
```

Behaviour that depends on PostgreSQL (migrations, RLS, extensions, transactions,
locking, concurrency) is proved against a real container — never a mock, SQLite
or in-memory substitute (ADR-006, FR-048). Concurrency tests use
`openIndependentConnections()` for genuinely separate sessions (FR-046).
