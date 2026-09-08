# ADR-010 — Time & Timezone Model

Status: Proposed

## Context

Appointment scheduling crosses local wall time, UTC instants, DST transitions and recurring availability. A single JavaScript `Date` abstraction is insufficient.

## Decision

Use Temporal semantics as the domain model, via `@js-temporal/polyfill` until native runtime support is intentionally adopted. Persist instants as `timestamptz`, persist IANA timezone ids explicitly, and store recurring wall-time rules separately from resolved instants. All scheduling intervals are half-open `[start,end)`. Raw `Date` is prohibited in domain scheduling code.

## Consequences

Adds a deliberate conversion boundary but prevents timezone-naive arithmetic and DST ambiguity. Property tests must cover DST gaps/overlaps and recurrence expansion.
