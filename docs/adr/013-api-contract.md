# ADR-013 — API Contract Strategy

Status: Proposed

## Context

Slotnova needs runtime validation, stable OpenAPI documentation, generated clients and MSW fixtures without hand-maintained duplicate contracts.

## Decision

HTTP request/response schemas live at API module boundaries and are defined with Zod-compatible runtime schemas. These schemas generate OpenAPI. The OpenAPI document is the external contract and generates client/types/test artifacts into `packages/contracts`; frontend code does not import backend entities or persistence models. Errors use RFC 9457-style `application/problem+json`. Breaking API changes require explicit versioning/deprecation treatment.

## Consequences

Avoids hand-written client drift while keeping domain models independent from transport schemas. Phase 1 must select the Nest/Zod/OpenAPI integration that satisfies this architecture without decorator duplication.
