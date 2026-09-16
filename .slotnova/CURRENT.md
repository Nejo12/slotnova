# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`7cc30a3863d4ad2359062cb17d4638e381e0bb1b` — merged PR #57 (Phase 2
planning gate — Catalog, Scheduling & Booking spec/plan/tasks). Planning
issue #56 is closed.

## Current implementation state

**Phase 1 is formally exited.** PR #55 is merged. Issues #2 (Phase 1
parent) and #54 (PR-20) are closed. All 18 Phase-1 success criteria
demonstrably passed — evidence matrix at `docs/phase-1-exit.md`.

**Phase 2 — Catalog, Scheduling & Booking (issue #3) planning is merged
and Founder-resolved.** The authoritative Spec Kit package at
`specs/002-catalog-scheduling-booking/` is implementation-ready with no
open Founder decision (single implicit workspace-level resource, no
persisted Draft/Pending, direct `Confirmed` creation, no location scope,
no Clients dependency on Booking).

**Phase 2 PR-01 — Catalog domain/schema foundation (issue #58) is under
implementation** on branch `phase-2/pr-01-catalog-foundation`: `services`/
`service_categories` domain invariants, repositories, and migration
`0006_catalog.sql` (RLS enabled+forced+policy, cross-workspace category
association rejected by a composite FK). No HTTP/contracts layer yet
(PR-02), no staff-service-capability or add-on persistence, no
Scheduling/Booking/Calendar/Staff/Clients work.

**Later Phase-2 slices (PR-02 through PR-10) remain not implemented.**
Do not begin Scheduling/Booking/Calendar/HTTP-contracts work before their
own bounded PR.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
