# ADR-023 — Analytics as an Event-Fed Read Model

Status: Proposed

## Context

Analytics needs data from many operational domains. Allowing it to query every module's tables directly would create pervasive schema coupling.

## Decision

Analytics owns dedicated read-model tables populated from versioned domain events/outbox consumers. Operational modules never depend on Analytics for transaction correctness, and Analytics does not import operational repositories or cross-query their tables. Rebuild/backfill paths are explicit.

Near-real-time operational metrics may use narrowly owned read projections where needed, but the dependency direction remains from operational events → analytics projections.

## Consequences

Introduces eventual consistency for analytics, which is acceptable for reporting/insight surfaces and buys strong domain independence. Requires event completeness/versioning and projection rebuild tooling.
