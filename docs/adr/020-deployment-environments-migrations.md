# ADR-020 — Deployment, Environments & Migration Policy

Status: Proposed

## Context

Phase 1 will create multiple deployables (web, API, worker) and database migrations. Deployment topology, environment boundaries and schema-change safety must be explicit before the platform foundation is considered complete.

## Decision

Maintain at least local, preview/CI, staging and production environment classes with separately managed secrets/data. Production database migrations run as an explicit gated release step, not an implicit application startup side effect. Non-trivial schema changes use expand → migrate/backfill → contract sequencing so old/new application versions can overlap safely. Roll-forward is the default recovery path; destructive rollback assumptions are prohibited for data migrations.

Hosting/provider selection remains adapter-compatible and is finalized before Phase 1 exit after confirming support for the chosen Node/PostgreSQL versions, private networking, backups and observability requirements.

`apps/worker` is an independently deployable process that may scale horizontally. Outbox consumers and scheduled-job workers must therefore use database-safe claiming/idempotency semantics (`FOR UPDATE SKIP LOCKED` or library-equivalent) rather than assuming a singleton worker. Any task that truly requires singleton execution must use an explicit database-backed lease/advisory-lock mechanism and document that invariant.

## Consequences

Adds release discipline early, reduces deploy-time lock/schema incidents, and keeps provider selection from silently dictating architecture. Worker correctness remains valid as topology grows from one process to multiple replicas.
