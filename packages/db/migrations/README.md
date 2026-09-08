# Migrations

Reviewed SQL migration files applied by the `@slotnova/db` gated runner
(`pnpm db:migrate`). ADR-020, FR-060, `docs/standards/ci-quality-gates.md`
("Database/migration gates").

## File convention

```
NNNN_snake_case_name.sql
```

- `NNNN` — zero-padded integer, **at least 4 digits**, strictly increasing and
  unique. Gaps are allowed (reserved ranges); duplicates are rejected.
- one purpose per file; plain SQL, no templating
- forward-only. Recovery is roll-forward (ADR-020); there are no `down` files
- non-trivial production changes follow **expand → migrate/backfill → contract**
- each file runs inside its own transaction. A file whose **first line** is
  `-- slotnova:no-transaction` runs outside a transaction (for
  `CREATE INDEX CONCURRENTLY` and similar)

The runner records `version`, `name`, `checksum` (SHA-256, line-ending
normalised) and `applied_at` in `public.schema_migrations`. Editing a file after
it has been applied is a hard error — ship a follow-up migration instead.

## Ownership

`packages/db` owns `schema_migrations` (runner bookkeeping) and nothing else.
Business tables are created by migrations that belong to a backend module's
slice (for example `apps/api/src/modules/identity` ships
`packages/db/migrations/00xx_identity.sql` in a later PR) — `packages/db` itself
defines no domain schema.

## Migration PR checklist

- [ ] reviewed SQL file (no `drizzle-kit push` / schema-diff shortcut)
- [ ] `assertCleanMigration` — applies to an empty database, idempotently
- [ ] `assertForwardMigration` — applies onto a representative populated state, no data loss
- [ ] `assertRlsCoverage` — every tenant-owned table touched has RLS enabled + FORCE + a policy
- [ ] constraint/index impact noted
- [ ] expand/contract plan for non-trivial changes
