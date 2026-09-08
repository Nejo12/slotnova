# Claude Code — Slotnova

@AGENTS.md

## Start here

Before non-trivial work, read:

1. `.specify/memory/constitution.md`
2. linked GitHub issue/spec
3. applicable accepted ADRs and architecture standards
4. `docs/product-handoff.md`
5. Figma node/page when your tooling can access it fully

Do not jump directly from a request to code.

## Planning model

Spec Kit is the canonical specification/planning layer.

Use the sequence as appropriate:

```text
constitution → specify → clarify → plan → tasks → implement
```

Superpowers is execution discipline (brainstorming, planning, worktrees, TDD, debugging, review, verification), not a second source of truth.

If a generated plan conflicts with accepted ADR/specification, stop and reconcile into the canonical artifact instead of keeping competing plans.

## Figma access caveat

Generic Figma metadata can expose only `00 — Cover` even though the Plugin API verifies a 61-page Slotnova file. If you cannot access `18 — Prototypes`, `19 — Implementation Handoff`, or another referenced page, trust the committed product handoff/spec for behavior and report the visual-access limitation. Never infer that the design is absent and never invent a replacement.

## Implementation discipline

- work from current `main`
- one bounded issue/PR
- follow module tiering and rule of three
- use real PostgreSQL for database constraints/RLS/concurrency correctness
- do not weaken tests to make a change pass
- run required fast/heavy gates before claiming completion
- do not merge or enable auto-merge; founder merges manually

## Before implementation

Phase 0 must be approved. See `docs/architecture/phase-0-gate.md`.
