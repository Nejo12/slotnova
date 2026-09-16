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
issue #56 is active; this planning pass produced the authoritative Spec
Kit package at `specs/002-catalog-scheduling-booking/` (spec, plan,
research, data model, contracts, quickstart, tasks) on branch
`phase-2/catalog-scheduling-booking-planning`. Three product decisions are
recorded as Founder-blocking in `plan.md`'s "Founder decisions required"
(Draft persistence, resource/staff scope, location scope) — the planning
package is otherwise implementation-ready.

**Phase 2 product implementation is BLOCKED** until the planning PR is
Founder-approved and merged, and until the three Founder-blocking
decisions above are resolved. Do not begin Catalog/Scheduling/Booking
application code before both conditions are met.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
