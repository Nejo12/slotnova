# AI Planning & Execution Workflow

Slotnova uses multiple AI tools, but committed project artifacts have one authority chain.

## Authority chain

```text
Figma/product decisions
→ engineering constitution / architecture standards
→ accepted ADRs
→ feature specification
→ technical plan
→ GitHub issue
→ implementation PR
→ tests/verification
→ founder merge
```

Chat output is advisory until committed into the appropriate durable artifact.

## Spec Kit

Use GitHub Spec Kit as the canonical specification/planning system once initialized locally.

Intended sequence for non-trivial features:

```text
constitution
→ specify
→ clarify where needed
→ plan
→ tasks
→ implementation
```

The specification describes what/why. Technical architecture belongs in the plan/ADRs rather than polluting product requirements.

## Superpowers

Use Superpowers as execution discipline, not as a second source of truth. Preferred capabilities include:

- brainstorming/design refinement
- writing plans
- git worktrees
- test-driven development
- systematic debugging
- requesting code review
- verification before completion
- finishing development branches

If a Superpowers-generated plan conflicts with committed ADR/specification, stop and resolve the conflict explicitly.

## Claude Code

`CLAUDE.md` imports `AGENTS.md` and adds Claude-specific workflow. Project-specific skills should encode repeatable Slotnova expertise, not duplicate generic framework documentation.

Candidate future project skills:

- booking-time-and-availability
- recovery-state-machine
- money-and-refunds
- multitenancy-and-permissions
- database-migrations
- API-contracts
- accessibility-and-motion
- testing-and-verification
- PR-review

Skills are added only when the rule set is stable enough to be reused and tested.

## Independent architecture review

Before Phase 0 is approved, run a separate architecture review with Claude Code (and optionally another capable model) that is instructed to critique rather than implement. Findings are reconciled into ADRs/docs before the founder merges the foundation PR.

## Agent safety rails

- agents do not merge PRs
- agents do not bypass failed tests by weakening correct assertions
- agents do not introduce new providers/frameworks without an ADR when architecturally significant
- agents do not silently change product semantics
- agents verify current `main` before starting implementation work
