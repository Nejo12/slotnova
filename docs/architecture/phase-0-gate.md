# Phase 0 — Architecture & Engineering Foundation Gate

No product implementation begins until this gate is explicitly approved.

## Tooling / authority verification

- [x] Slotnova repository is private and writable through the connected GitHub integration
- [x] approved Figma corpus re-verified through Plugin API: 61 pages including `18 — Prototypes` and `19 — Implementation Handoff`
- [x] incomplete generic-Figma-API behavior documented so agents do not invent missing UI
- [x] Spec Kit installed/initialized locally for Claude Code
- [x] Superpowers verified installed in Claude Code
- [x] real `.specify/memory/constitution.md` committed on the Phase 0 branch
- [x] independent Claude Code architecture review completed
- [x] review findings classified/reconciled in `phase-0-review-reconciliation.md`

## Required architecture decisions

The following must be founder-approved and their ADR status changed from `Proposed` to `Accepted` (or deliberately superseded) before implementation begins.

- [ ] ADR-001 modular monolith
- [ ] ADR-002 monorepo structure
- [ ] ADR-003 frontend stack/routing/state boundaries
- [ ] ADR-004 backend/data stack
- [ ] ADR-005 transactional outbox
- [ ] ADR-006 testing architecture
- [ ] ADR-007 authentication/session model
- [ ] ADR-008 tenant isolation/RLS
- [ ] ADR-009 authorization model
- [ ] ADR-010 time/timezone model
- [ ] ADR-011 booking overlap prevention
- [ ] ADR-012 domain module map/tiering
- [ ] ADR-013 API contract strategy
- [ ] ADR-014 job scheduler strategy (library benchmark may remain a Phase 1 selection task if architecture is accepted)
- [ ] ADR-015 money/tax/allocation rules
- [ ] ADR-016 Recovery state machines/invariants
- [ ] ADR-017 consent/quiet-hours/frequency-capping boundary
- [ ] ADR-018 public Recovery offer security surface
- [ ] ADR-019 retention/erasure/audit policy
- [ ] ADR-020 deployment/environments/migration policy
- [ ] ADR-021 frontend feature structure
- [ ] ADR-022 Figma → design-token pipeline
- [ ] ADR-023 Analytics read-model architecture
- [ ] ADR-024 cross-boundary event versioning

## Required implementation-readiness checks

- [ ] implementation plan matches final domain/module map
- [ ] issue graph matches final dependency order and no issue depends on a still-Proposed decision
- [ ] Phase 1 provider-neutral decisions are explicit enough to bootstrap without schema rework
- [ ] deployment target/provider constraints rechecked before PostgreSQL/runtime versions are pinned in code
- [ ] first implementation PR is bounded to platform foundation; no product-domain feature is smuggled in
- [ ] final Spec Kit analysis/checklist finds no unresolved MUST-tier contradiction
- [ ] final read-only independent consistency review returns READY or READY WITH NON-BLOCKING CHANGES

## Gate rule

Merging PR #10 **authorizes implementation** against the committed architecture. Therefore PR #10 must not be merged while any blocker-level architecture decision above is disputed or still awaiting founder approval.

If we later choose to merge documentation before authorization, the PR/gate wording must first be changed explicitly; never let a merge silently change meaning.
