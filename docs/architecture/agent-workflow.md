# AI Planning & Execution Workflow

Slotnova uses multiple AI tools, but committed artifacts have one authority chain. Chat output is advisory until reconciled into those artifacts.

## Authority chain

```text
Founder-approved product decision + current main
→ accepted ADRs / committed architecture + product specification
→ approved Figma for visual/interaction detail
→ feature specification
→ linked GitHub issue / technical plan
→ implementation PR + tests
→ founder merge
```

The constitution governs this chain. Do not create competing parallel authorities.

### Figma tooling caveat

Some generic Figma metadata/API surfaces may expose only the cover page even when the Plugin API sees the full document. This happened during the independent Phase 0 review: generic metadata reported one page, while a Plugin API read verified 61 pages including `18 — Prototypes` and `19 — Implementation Handoff`.

Therefore agents that cannot read the full Figma corpus must use the committed `docs/product-handoff.md` and relevant specs as behavioral authority and must not infer that referenced screens do not exist. Visual uncertainty is surfaced, not invented.

## Spec Kit

GitHub Spec Kit is the canonical feature specification/planning system.

```text
constitution
→ specify
→ clarify when needed
→ plan
→ tasks
→ implementation
```

The specification captures what/why and acceptance behavior. Architecture-changing technical decisions belong in ADRs; implementation decomposition belongs in the plan/tasks.

`.specify/` project-owned configuration/constitution is versioned. Third-party generated agent skill/plugin internals are not vendored merely because they exist locally.

## Superpowers

Superpowers is execution discipline, not a second source of truth. Useful capabilities include brainstorming, plan review, worktrees, TDD, systematic debugging, code review and verification-before-completion.

If a Superpowers output conflicts with accepted ADR/specification, stop and reconcile; do not create a second plan tree.

## Claude Code

`CLAUDE.md` imports/points to project rules and Claude-specific workflow. Project-owned skills should encode repeatable Slotnova expertise only after the rule set is stable.

Candidate Slotnova skills:

- booking-time-and-availability
- recovery-state-machine
- money-tax-and-refunds
- multitenancy-and-permissions
- database-migrations
- API-contracts
- accessibility-and-motion
- testing-and-verification
- PR-review

Do not commit third-party generated `.claude/skills` content as project source unless we intentionally fork/own it.

## Independent architecture review

Phase 0 requires an independent critique. Findings are not accepted automatically: each is classified as accepted, modified, deferred or rejected and reconciled into ADRs/docs. The reconciliation record is durable.

## Agent safety rails

- agents do not merge PRs or enable auto-merge
- agents do not bypass failed tests by weakening correct assertions
- agents do not introduce new providers/frameworks without architecture review when significant
- agents do not silently change product semantics
- agents verify current `main` before implementation work
- agents apply the rule of three and module tiering before introducing abstractions
- agents never create state-changing GET endpoints
- agents never bypass tenant scoping/RLS for convenience
