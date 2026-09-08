# Claude Code — Slotnova

@AGENTS.md

## Working mode

Slotnova is specification-led. Do not jump from a feature request directly to implementation.

For non-trivial work:
1. Read the linked GitHub issue and relevant Figma/handoff references.
2. Read applicable ADRs and architecture standards.
3. Produce or update a feature specification and technical plan before code.
4. Keep the change bounded to one issue/PR.
5. Use tests to verify domain behavior, not to justify hard-coded implementations.
6. Run the required verification gates before claiming completion.

## Agent workflow

- Spec Kit is the canonical specification/planning layer once initialized locally.
- Superpowers is the preferred execution discipline for brainstorming, planning, worktrees, TDD, systematic debugging, review and verification.
- GitHub remains the durable execution record.
- Do not let generated plans in chat override committed specifications/ADRs silently.

## Architecture rule

Slotnova begins as a modular monolith in a pnpm/Turborepo monorepo. Domain boundaries are explicit; provider infrastructure sits behind typed ports/adapters. Do not introduce microservices, generic base services, generic repositories, or one-off abstractions without an accepted ADR.

## Before implementation

Phase 0 must be approved. See `docs/architecture/phase-0-gate.md`.
