# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`2d556dec48e6203320b323ccfd6f62790b735304` — merged PR #55 (PR-20 /
T090-T091 final Phase-1 validation, documentation reconciliation and
exit). Phase 1 is formally complete.

## Current implementation state

**Phase 1 is formally exited.** PR #55 is merged. Issues #2 (Phase 1
parent) and #54 (PR-20) are closed. All 18 Phase-1 success criteria
demonstrably passed — evidence matrix at `docs/phase-1-exit.md`. All six
Phase-1 exit decision records (`docs/decisions/0001`-`0006`) exist and are
founder-approved.

**Phase 2 — Catalog, Scheduling & Booking (issue #3) is active.** Planning
issue #56 is active; the authoritative Spec Kit package lives at
`specs/002-catalog-scheduling-booking/` (spec, plan, research, data model,
contracts, quickstart, tasks) on branch
`phase-2/catalog-scheduling-booking-planning`, open as PR #57.

**Founder review resolved all four originally Founder-blocking decisions**,
plus one Clients-sequencing gap found by independent review, on
2026-09-16:

1. `Draft`/`Review` are client/UI-only — not persisted.
2. Operator-created Bookings are created directly `Confirmed` — no
   Phase-2 `Pending` producer.
3. Phase 2 uses a single implicit workspace-level bookable resource — no
   staff identity/CRUD/capability table; staff-service capability is a
   documented future integration port.
4. Location scope is deferred entirely — no speculative `location_id`.
5. Phase-2 Booking does not persist a `client_id` — no customer/client
   entity exists on current `main`; Phase 3 adds the association
   additively.

The planning package (spec/plan/research/data-model/contracts/tasks) is
implementation-ready with no open Founder decision remaining.

**Phase 2 product implementation is BLOCKED** until PR #57 is
Founder-approved and merged. Do not begin Catalog/Scheduling/Booking
application code before that merge.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
