# Phase 0 — Architecture & Engineering Foundation Gate

Status: **APPROVED**

Founder approval recorded: **2026-09-08**.

The founder explicitly approved Slotnova Phase 0 and ADR-001 through ADR-024. Product implementation may begin only after PR #10 is manually merged.

## Tooling / authority verification

- [x] Slotnova repository is private and writable through the connected GitHub integration
- [x] approved Figma corpus re-verified through Plugin API: 61 pages including `18 — Prototypes` and `19 — Implementation Handoff`
- [x] incomplete generic-Figma-API behavior documented so agents do not invent missing UI
- [x] Spec Kit installed/initialized locally for Claude Code
- [x] Superpowers verified installed in Claude Code
- [x] real `.specify/memory/constitution.md` committed on the Phase 0 branch
- [x] independent Claude Code architecture review completed
- [x] review findings classified/reconciled in `phase-0-review-reconciliation.md`
- [x] final independent consistency review returned `READY WITH NON-BLOCKING CHANGES`

## Accepted architecture decisions

- [x] ADR-001 modular monolith
- [x] ADR-002 monorepo structure
- [x] ADR-003 frontend stack/routing/state boundaries
- [x] ADR-004 backend/data stack
- [x] ADR-005 transactional outbox
- [x] ADR-006 testing architecture
- [x] ADR-007 authentication/session model
- [x] ADR-008 tenant isolation/RLS
- [x] ADR-009 authorization model
- [x] ADR-010 time/timezone model
- [x] ADR-011 booking overlap prevention
- [x] ADR-012 domain module map/tiering
- [x] ADR-013 API contract strategy
- [x] ADR-014 job scheduler strategy (concrete library selection is a Phase 1 exit condition)
- [x] ADR-015 money/tax/allocation rules
- [x] ADR-016 Recovery state machines/invariants
- [x] ADR-017 consent/quiet-hours/frequency-capping boundary
- [x] ADR-018 public Recovery offer security surface
- [x] ADR-019 retention/erasure/audit policy
- [x] ADR-020 deployment/environments/migration policy
- [x] ADR-021 frontend feature structure
- [x] ADR-022 Figma → design-token pipeline
- [x] ADR-023 Analytics read-model architecture
- [x] ADR-024 cross-boundary event versioning

## Phase 0 implementation-readiness checks

- [x] implementation plan matches final domain/module map
- [x] issue graph matches final dependency order and all architecture decisions required to begin Phase 1 are Accepted
- [x] Phase 1 provider-neutral decisions are explicit enough to bootstrap without schema rework
- [x] first implementation PR is bounded to platform foundation; no product-domain feature is smuggled in
- [x] Phase 0 independent consistency review found no unresolved MUST-tier contradiction; Spec Kit `/speckit-analyze` applies once a feature has `spec.md`/`plan.md`/`tasks.md` artifacts

## Deferred Phase 1 exit decisions — not Phase 0 blockers

These decisions are intentionally deferred but **must be recorded before Phase 1 exits**:

- managed hosting/PostgreSQL provider selection and version compatibility
- exact dependency/runtime version pins after compatibility verification
- graphile-worker vs pg-boss scheduler selection
- Nest/Zod/OpenAPI integration selection within ADR-013's bounded candidate set

## Authorization boundary

Merging PR #10 authorizes **Phase 1 — Platform Foundation & Shell only** against the accepted architecture.

It does not authorize skipping directly to Booking, Recovery, Payments or later product phases. Each subsequent phase remains governed by its GitHub issue/specification, accepted ADRs, tests and manual-merge workflow.

## Merge policy

- no auto-merge
- founder manually merges PR #10
- implementation starts from the merged `main`
- future architecture changes require an explicit ADR amendment/superseding ADR rather than silent drift
