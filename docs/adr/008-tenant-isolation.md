# ADR-008 — Tenant Isolation

Status: Proposed

## Context

Slotnova is multi-tenant. An omitted `workspace_id` predicate in agent-written code would be a critical data breach.

## Decision

Enforce tenant isolation with defense in depth: PostgreSQL RLS on tenant-owned tables, transaction-scoped tenant context (`SET LOCAL app.workspace_id = ...` or equivalent), tenant-scoped repository APIs, and generated/parameterized cross-tenant tests. Product code may not issue unscoped tenant queries.

## Consequences

Adds database-policy and integration-test complexity, but makes tenant isolation mechanically enforceable rather than conventional.
