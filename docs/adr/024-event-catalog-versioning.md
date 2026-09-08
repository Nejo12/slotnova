# ADR-024 — Domain Event Catalogue & Versioning

Status: Proposed

## Context

Recovery, Notifications, Analytics and integrations depend on asynchronous events. Once events cross module/process boundaries they become contracts and cannot be changed casually.

## Decision

Maintain an explicit event catalogue. Cross-boundary events use stable names and versioned payload schemas. Additive changes are preferred; incompatible payload changes create a new event version and consumers support an intentional transition window. Events carry correlation/request identifiers and workspace context but minimize PII.

Internal in-process domain events that never cross a module boundary may evolve with the module and do not require external contract versioning.

## Consequences

Creates lightweight contract discipline without prematurely introducing a schema registry. Enables Analytics projection rebuilds and safe consumer evolution.
