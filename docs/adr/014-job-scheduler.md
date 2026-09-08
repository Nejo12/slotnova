# ADR-014 — Job Scheduler Separate from Outbox

Status: Proposed

## Context

The transactional outbox reliably publishes events caused by a database transaction, but it does not by itself solve delayed reminders, offer expiry, recurring jobs, retry backoff or dead-letter handling.

## Decision

Keep the transactional outbox for atomic event publication. Use a Postgres-backed job scheduler/worker library for delayed/recurring/retryable work. Phase 1 must benchmark **graphile-worker** and **pg-boss** against Node/Nest/PostgreSQL requirements and record the selected implementation **before Phase 1 exits**. Do not introduce Kafka/Redis solely for job scheduling without evidence.

## Consequences

Separates event publication from scheduling semantics and avoids hand-rolling durable queue behavior. Adds one Postgres-backed worker dependency but keeps operational topology simple. Phase 1 may bootstrap the worker boundary before the concrete library is selected, but the selection is an explicit Phase 1 exit condition.
