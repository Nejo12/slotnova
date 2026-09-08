# ADR-001 — Modular Monolith

Status: Proposed

## Context

Slotnova is expected to become a large platform with many operational domains, but it begins with a small implementation team. Premature microservices would multiply deployment, observability, consistency and testing complexity.

## Decision

Start as one backend deployable organized as explicit bounded modules. Enforce inward dependencies and provider ports/adapters. Extract a service only when measured scale, isolation, ownership or reliability requirements justify it.

## Consequences

Benefits: simpler deployment/transactions, easier local development, strong testability, lower operational overhead.

Costs: module boundaries must be enforced deliberately; careless cross-imports could produce a distributed-monolith-style coupling inside one process.
