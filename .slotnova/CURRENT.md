# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`a54d3cfcc9bf984cdc103172fa96f4b5e1db1252` — merged PR #59 (Phase 2 PR-01
— Catalog domain/schema foundation). Issue #58 is closed.

## Current implementation state

**Phase 1 is formally exited.** PR #55 is merged. Issues #2 (Phase 1
parent) and #54 (PR-20) are closed. All 18 Phase-1 success criteria
demonstrably passed — evidence matrix at `docs/phase-1-exit.md`.

**Phase 2 — Catalog, Scheduling & Booking (issue #3) planning is merged
and Founder-resolved** (PR #57). The authoritative Spec Kit package at
`specs/002-catalog-scheduling-booking/` has no open Founder decision.

**Phase 2 PR-01 — Catalog domain/schema foundation (issue #58) is
merged** (PR #59): `services`/`service_categories` domain invariants,
repositories, and migration `0006_catalog.sql` (RLS enabled+forced+policy,
cross-workspace category association rejected by a composite FK).

**Phase 2 PR-02 — Catalog API/contracts (issue #60) is PAUSED.** Its
authoritative contract requires durable `Idempotency-Key` replay semantics
for `POST /catalog/services`, and no durable API-request-idempotency
facility existed on `main`. Silently adding one inside an API-only PR
would have been an unauthorized schema change, so PR-02 was paused rather
than faking in-memory replay.

**Phase 2 PR-02A — Durable API idempotency foundation (issue #61) is
under implementation** on branch `phase-2/pr-02a-durable-api-idempotency`:
`apps/api/src/modules/platform/idempotency/` (`claim`/`complete`/
`executeIdempotently`, canonical request fingerprinting) + migration
`0007_platform_idempotency.sql` (`public.idempotent_requests`, RLS
enabled+forced+policy, `UNIQUE (workspace_id, operation,
idempotency_key)`). Provider-neutral — knows nothing about Catalog. No
Catalog controller/endpoint work is included here.

**PR-02 resumes once PR-02A merges**, consuming `executeIdempotently`
directly with no further schema change for Catalog idempotency. No
Scheduling/Booking/Calendar/Staff/Clients work exists yet; later Phase-2
slices (PR-03 through PR-10) remain not implemented.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
