# Phase 1 worker (T068–T071)

R3 is Founder-approved: **pg-boss 12.31.1**, pinned exactly. The verified
package export is `import { PgBoss } from "pg-boss"`; the fast test exercises
that constructor. pg-boss is the scheduler, never the transactional outbox.

## Outbox delivery

Business transactions still write `public.outbox_records` using the existing
API writer. A dedicated session holds one advisory lock keyed by a unique
worker-run token. Each bounded claim transaction selects ready rows with
`FOR UPDATE SKIP LOCKED`, excludes owners whose session lock remains held,
and updates the existing claim fields. Keyset traversal visits at most one batch
per poll and wraps after its final page, so a live owner cannot starve newer
work. Advisory-lock acquisition happens only after selecting bounded candidates,
never in a filter that PostgreSQL could evaluate across the entire backlog.
Handler execution holds no row locks.
Rows from disconnected workers become eligible when PostgreSQL releases their
session lock; there is no elapsed lease that can steal work from a slow handler.
Use a direct/session-capable connection, never transaction-mode pooling.
Recovery latency depends on PostgreSQL detecting a disconnected session.

Attempts count **started claims**, including claims interrupted by a crash.
The default budget is five total claims. Handler failure releases the claim
and schedules its next eligibility after the polling interval; an exhausted
row receives `dead_lettered_at`. A crash on the last claim is dead-lettered by
the next consumer. Rows and payloads remain available for inspection. A batch
interrupted before all handlers start still consumes those rows' claim attempts.

Delivery is **at-least-once**. Current catalogue events (`invitation.issued`,
`invitation.accepted`, `membership.created`, version 1) are validated and
acknowledged; no downstream product effect exists in Phase 1. Repetition is
therefore harmless. Delivery logs may repeat. Future side effects must use
`record.id` as a transactional deduplication/provider idempotency key. The
process-crash tests use a test-only unique-key effect committed before the
acknowledgement barrier; this is not a production outbox or deduplication table.

`payload.requestId` becomes both ALS request and correlation ID. Dispatch also
sets PostgreSQL workspace/request context, resetting it before connection reuse.
Handlers must continue to enter scoped application ports for tenant operations;
ALS/session context alone is not permission to bypass RLS.

## Scheduler and maintenance

pg-boss exclusively owns its separate configurable schema (`pgboss` by default).
No internal tables are mutated manually or added to Drizzle migrations.
Three queues run hourly at `0 * * * *` in UTC:

- Expired sessions: bounded deletion after expiration and any revocation are
  both older than the explicit retention period; referenced rotation ancestors
  remain until their descendants can be removed. Active sessions stay intact.
- Expired invitations: keyset-page workspace roots, then bounded pending → expired
  sweeps using PostgreSQL time, `SET LOCAL ROLE slotnova_app` and workspace RLS.
  Accepted/revoked rows are preserved. Identity owns these queries behind its
  explicit `@slotnova/api/identity-maintenance` application entry.
- Outbox retention: only old processed rows with no claim or dead-letter marker
  are pruned. Unprocessed/retryable/dead-letter rows are never pruned.

These maintenance operations are idempotent. Queues use three retries after the
initial attempt, five-second exponential backoff, and a 15-minute execution
expiry. pg-boss retains terminal jobs for 30 days (`deleteAfterSeconds`); jobs
waiting to start have seven-day retention. `inspectFailures(limit)` provides a
bounded read-only inspection/logging seam over pg-boss's explicit `failed` state.
There is no second DLQ or external alert vendor. Queue retries are distinct from
the outbox's claim-attempt budget. The integration suite proves the supported
per-call `executeSql` transaction adapter rolls scheduling back with its caller.

## Startup, configuration, and schema ownership

Run Slotnova's existing explicit migrations first. pg-boss owns its own
construction/version upgrades through its supported `start()` API. For local
and disposable test provisioning, `WORKER_SCHEDULER_MIGRATE=true` allows this
library-owned initialization. Normal worker startup defaults to `migrate=false`;
production rejects this flag. Production must provision/upgrade pg-boss in an
explicit release action using the pinned library before starting workers.
This PR documents the ordering; deployment migration gating remains T074.

`WORKER_DATABASE_URL` is an explicit worker credential, separate from
`DATABASE_MIGRATION_URL`. Provision permissions for platform outbox maintenance,
session cleanup, workspace enumeration, pg-boss's schema, and membership in the
existing `slotnova_app` role. Invitation sweeps deliberately switch to that
non-bypass role. This PR does not redesign environment/role provisioning (T072+).
Existing `DATABASE_SSL`, timeout, and pool validation conventions are reused.

| Setting | Default | Bound |
|---|---|---|
| `WORKER_INSTANCE_ID` | generated UUID | unique run token added internally |
| `WORKER_BATCH_SIZE` | 50 | 1–1000 |
| `WORKER_POLL_INTERVAL_MS` | 1000 | 1–60000 |
| `WORKER_MAX_ATTEMPTS` | 5 | 1–100 |
| `WORKER_RETENTION_DAYS` | 30 | 1–3650; sessions and processed outbox |
| `WORKER_SCHEDULER_SCHEMA` | pgboss | validated identifier, not public |
| `WORKER_SCHEDULER_MIGRATE` | false | local/test initialization only |

SIGTERM/SIGINT stop polling, drain in-flight handlers, unregister/drain scheduler
workers via the supported API, stop pg-boss, and close pools. SIGKILL deliberately
skips this lifecycle. Session-lock recovery and durable pg-boss storage handle it.

## Verification

Use pinned Node 24.20.0 and pnpm 12.3.4 with Docker available:

```sh
pnpm build
pnpm --filter @slotnova/worker test:integration
```

Tests use real PostgreSQL 18, independent connections/processes, observable
barriers and bounded polling. Recurrence waits for two actual cron executions
(up to 150 seconds); no sleeps are used as correctness synchronization.
