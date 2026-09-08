# ADR-005 — Transactional Outbox and Worker

Status: Proposed

## Context

Recovery, messaging, provider synchronization, notifications and analytics side effects are asynchronous and must survive process failures without double-applying critical outcomes.

## Decision

Use a PostgreSQL-backed transactional outbox plus a dedicated worker process. Domain/application transactions persist the state change and outbox record atomically. Workers deliver external side effects with idempotency keys and retry policy.

Do not introduce Kafka or microservice messaging infrastructure initially.

## Guardrails

- handlers are idempotent
- retries are bounded and observable
- poison/dead-letter behavior is explicit
- external provider webhooks are deduplicated
- recovery completion and payment/refund processing cannot double-apply business value
