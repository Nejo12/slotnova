# ADR-011 — Booking Overlap Prevention

Status: Proposed

## Context

Check-then-insert availability logic is race-prone when multiple operators or Recovery acceptances target the same capacity.

## Decision

PostgreSQL is the final booking-overlap correctness boundary. Use `btree_gist` and an exclusion constraint over the blocking interval (customer appointment plus pre/post buffers) for blocking statuses. Application checks remain for UX only. Concurrency tests must use independent database connections.

## Consequences

Booking writes can fail with a database conflict that application code must translate into a domain/API conflict response. This prevents double-booking under true concurrency.
