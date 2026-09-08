# ADR-016 — Recovery Engine State Machines

Status: Proposed

## Context

Recovery is Slotnova's core differentiator and combines concurrency, public acceptance, booking consistency, notification delivery and revenue attribution. A linear request chain is insufficient.

## Decision

Model Recovery with explicit Vacancy and Offer state machines plus an application-level process manager. Acceptance is transactional and re-checks offer token/state/expiry/eligibility. Database constraints enforce at most one accepted offer per vacancy where practical. The winning acceptance creates/updates exactly one booking, competing offers are superseded/closed, and attribution is exactly-once. Ranking is deterministic and value-at-risk is snapshotted for historical integrity. All external delivery handlers are idempotent.

Track `recoveredBooked` separately from `recoveredRealised`; later cancellation/no-show/refund transitions attribution/revenue explicitly rather than leaving headline metrics monotonically inflated.

## Consequences

Recovery requires real PostgreSQL integration and concurrency tests, not mocked repository-only tests. It remains a process manager using ports to Scheduling, Booking, Catalog, Clients and Notifications rather than importing their persistence.
