# ADR-012 — Domain Module Map & Tiering

Status: Accepted

## Context

The initial module list omitted Catalog and treated UI surfaces such as Settings/Calendar as bounded contexts. Full DDD ceremony across every module would create unnecessary complexity, especially in an AI-assisted codebase.

## Decision

Use three module tiers.

Core: Scheduling, Booking, Recovery, Payments — full domain/application/infrastructure/http layering where invariants justify it.

Supporting: Identity, Catalog, Clients, Staff, Messaging, Notifications, Inventory, Marketing/Retention — lighter structure; add a domain layer only for real invariants.

Generic/platform: Audit, Analytics read models, tenancy/outbox/jobs/telemetry — deliberately thin.

Calendar, Settings and Dashboard are UI/read-model compositions, not backend bounded contexts. Analytics owns event-fed read models and never cross-queries another context's tables.

## Consequences

Clarifies ownership and limits abstraction bloat. Cross-context behavior must use application ports/contracts rather than repository/table access.
