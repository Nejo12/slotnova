# ADR-013 — API Contract Strategy

Status: Proposed

## Context

Slotnova needs runtime validation, stable OpenAPI documentation, generated clients and MSW fixtures without hand-maintained duplicate contracts.

## Decision

HTTP request/response schemas live at API module boundaries and are defined with Zod-compatible runtime schemas. These schemas generate OpenAPI. The OpenAPI document is the external contract and generates client/types/test artifacts into `packages/contracts`; frontend code does not import backend entities or persistence models. Errors use RFC 9457-style `application/problem+json`. Breaking API changes require explicit versioning/deprecation treatment.

Phase 1 must select the Nest/Zod/OpenAPI integration from a bounded candidate set rather than reopening the architecture. Evaluate at minimum `nestjs-zod`, a minimal custom Zod validation/serialization adapter around Nest, and any current maintained Nest/OpenAPI integration that preserves runtime-schema-first generation without decorator duplication.

## Consequences

Avoids hand-written client drift while keeping domain models independent from transport schemas. The Phase 1 spike is implementation selection inside an already accepted contract direction, not a choice between code-first decorators and runtime-schema-first APIs.
