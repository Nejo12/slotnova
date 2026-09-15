# Explicit migration release (T074)

Business SQL lives in `packages/db/migrations`; pg-boss owns a separate `pgboss` schema. Application startup is never a migration runner. [Deployment prerequisites](deployment.md) and [ADR-020](../adr/020-deployment-environments-migrations.md) apply. No schema push command is permitted.

## Roles and bootstrap

An authorized bootstrap operator creates the database, `citext` where policy requires, and roles. Use an ordinary NOLOGIN business-owner role with a separate release login/membership, or the tested ordinary login business migrator owning its tables. Runtime API login inherits only `slotnova_app` grants and has NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE; it cannot assume business/migration/admin owners. Retain FORCE RLS. Never grant owner membership to make a readiness check pass.

Bootstrap creates `slotnova_scheduler_owner NOLOGIN NOSUPERUSER NOBYPASSRLS`, creates schema `pgboss AUTHORIZATION slotnova_scheduler_owner`, and grants that role to a separate scheduler-release login and the worker login. The worker also inherits ordinary application grants plus required outbox/session-cleanup/workspace access from the reviewed migration grant model. It must not own public business tables. Revoke public schema CREATE from runtime roles. Keep database CREATE and role administration with bootstrap/business release as needed, never with the worker.

The scheduler release CLI executes `SET ROLE slotnova_scheduler_owner`, verifies existing schema ownership, and uses pinned pg-boss with `createSchema=false`. Thus scheduler initialization does not require database-wide CREATE. Runtime pg-boss needs schema ownership privileges for queue/partition functions; a DML-only grant is insufficient. Neither scheduler role owns Slotnova outbox rows/tables. Review any pg-boss version change as a schema change, including its compatibility and downtime requirements.

## Commands and ordering

Build the reviewed exact commit with frozen lockfile. Configure `SLOTNOVA_ENV`, direct connection mode, verified TLS and CA trust before executing either command. Supply only the credential named for that step:

```sh
pnpm --filter @slotnova/db db:migrate
pnpm --filter @slotnova/worker db:migrate:scheduler
```

The first requires `DATABASE_MIGRATION_URL`; the second requires `SCHEDULER_MIGRATION_URL` and `SCHEDULER_OWNER_ROLE`. Both are standalone built entry points. Business migration supports `--dry-run` and `--to` through its underlying CLI (`node packages/db/dist/bin/migrate.js --dry-run`). Dry run validates pending work; it does not prove production locks, data compatibility or successful execution.

1. Review backup/PITR status, migration plan, data volume, lock/statement budget and old/new binary compatibility.
2. Apply additive business migrations using the business release credential. Each transactional SQL file commits independently under the migration advisory lock; checksum mismatch, privilege failure or SQL failure exits nonzero.
3. Initialize/upgrade the pinned scheduler using its separate release credential. Stop old workers first if that pg-boss version cannot share the upgraded schema; document the resulting processing pause. API can continue only if the business compatibility plan permits it.
4. Only after both release steps succeed, roll out compatible API and worker binaries. Worker starts with `WORKER_SCHEDULER_MIGRATE=false`. Verify readiness, queue health and error rates before continuing rollout.
5. Perform bounded, restartable and observable backfills. Verify data before switching reads/writes. Remove old schema only in a later reviewed contract release after all old tasks, jobs and rollback artifacts are retired.

Compatibility window covers the entire rolling deployment plus any supported application rollback interval; specify actual versions and duration in every schema-changing PR. No fixed universal interval is implied. Prefer nullable/additive columns first; assess defaults, rewrites and validation costs on representative volume. Use staged constraint validation and concurrent indexes when required. Nontransactional files must use the existing explicit `-- slotnova:no-transaction` directive; review partial-failure cleanup separately.

## CI and release gates

`heavy.yml` proves clean and representative populated-forward business migration through the actual CLI using an ordinary migration principal. It proves scheduler initialization/idempotency with a separate owner and runtime queue/partition operations using an ordinary worker. The populated fixture is the real foundation through migration 0003, with a user/workspace/membership, forwarded through 0004/0005 and checked for data retention, FORCE RLS and transaction-local reset. This is representative of this foundation, not future production volumes. Extend the fixture for every new migration's affected state.

The PR checklist job enforces one schema yes/no choice, nine review acknowledgements, and a concrete migration plan for schema changes; SQL files and scheduler CLI changes cannot be labeled no. Reviewers must still assess the plan's truth and scope. No checkbox automation proves safety by itself.

Hosted release is deliberately **disabled** unless repository variable `MIGRATION_RELEASE_ENABLED=true`. Only Founder/repository-owner `workflow_dispatch` from `main`, with `release_sha` exactly equal to the dispatch SHA and an owner-triggered rerun, can enter the release job. The migration proof must pass first. A dedicated private Linux runner labeled `slotnova-release` and separately scoped staging/production environment secrets are required. Release jobs serialize per environment and never cancel a running migration. Failure blocks the next step; the workflow does not deploy application tasks.

Do not enable the variable until the private runner, outbound dependency access, trusted CA file variable, secrets and release controls have been reviewed. Use ephemeral dedicated release runners; never route untrusted PR jobs to them. GitHub environment protection availability depends on this private repository's plan: required-reviewer protection is **not assumed configured or available**. Verify the entitlement and actual controls; Founder-only dispatch/exact-main gating and the disabled flag are the committed baseline, not a claim of provisioned environment protection. Ordinary CI has only disposable PostgreSQL and no hosted credentials. This is T074's heavy workflow foundation, not full T087 completion.

## Failure and recovery

Stop progression at any failed migration. Preserve restricted database/release logs, inspect the ledger/checksum and determine whether the current file rolled back or partially applied. Never edit an already applied migration or forge its checksum. Transactional files roll back only their own changes; preceding committed migrations remain. Nontransactional operations may need a reviewed repair. Roll forward with a new reviewed SQL migration or documented idempotent repair, rerun proof, then release. Check locks and statement progress before terminating a session; do not launch competing manual runners.

Application rollback is allowed only while the previous binary remains schema-compatible. It does not undo committed data transformations or restore deleted columns. Destructive changes require explicit Founder approval of consequences, verified isolated restore rehearsal, recovery point, downtime and data-loss plan before execution. A backup is not a lossless rollback after new writes. PITR/snapshot restore creates a separate database and requires validated, approved cutover; never overwrite the source as an improvised recovery step. No automatic down migration is supplied.
