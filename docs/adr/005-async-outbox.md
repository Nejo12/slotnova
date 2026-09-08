# ADR-005 — Transactional Outbox

Status: Accepted

## Context

Recovery, notifications, provider synchronization, payments and analytics side effects must survive process failures without double-applying business value. Delayed/recurring work is a separate concern from reliable event publication.

## Decision

Use a PostgreSQL-backed transactional outbox for events caused by a database transaction. The business state change and outbox row are persisted atomically. Consumers are idempotent and deliver external side effects with idempotency keys.

The outbox is **not** the job scheduler. Delayed reminders, offer expiry, retry backoff, recurring rollups and dead-letter handling use the Postgres-backed worker selected under ADR-014.

Do not introduce Kafka or microservice messaging infrastructure initially.

## Guardrails

- handlers are idempotent
- claiming uses safe concurrent semantics (e.g. `FOR UPDATE SKIP LOCKED` where appropriate)
- retries are bounded and observable
- poison/dead-letter behavior is explicit
- external provider webhooks are deduplicated and ordering-safe
- event payloads are versioned once they cross module/process boundaries
- recovery completion and payment/refund processing cannot double-apply business value
- outbox retention/archival prevents uncontrolled table growth
