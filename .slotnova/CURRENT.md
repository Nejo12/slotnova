# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`ac49545adaa164051babb36ffc7e277822bf6d71` — merged PR #62 (Phase 2 PR-02A
— durable API idempotency foundation). Issue #61 is closed. PR #59 (PR-01,
issue #58) merged before it.

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

**Phase 2 PR-02A — Durable API idempotency foundation (issue #61) is
merged** (PR #62): `apps/api/src/modules/platform/idempotency/`
(`executeIdempotently` — the only exported entry point — plus canonical
request fingerprinting) + migration `0007_platform_idempotency.sql`
(`public.idempotent_requests`, RLS enabled+forced+policy,
`UNIQUE (workspace_id, operation, idempotency_key)`). It supports only
mutations whose protected database write and replay record commit
atomically in one PostgreSQL transaction — an earlier split-transaction
claim/lease/reclaim design was found unsafe by independent review and
removed rather than patched. Provider-neutral — knows nothing about
Catalog.

**Phase 2 PR-02 — Catalog API/contracts (issue #60) is complete** and
delivered on branch `phase-2/pr-02-catalog-api-contracts`. Six endpoints
under `/v1/catalog`: `GET|POST /services`, `GET|PATCH /services/{id}`,
`GET|POST /categories`. `catalog:read` gates the reads and
`catalog:manage` the writes, enforced by the existing server-authoritative
`CapabilityGuard`. `POST /v1/catalog/services` requires an
`Idempotency-Key` and consumes `executeIdempotently` with the claim, the
`services` insert and the stored replay response in ONE transaction; no
Catalog idempotency persistence and **no schema migration** were added
(PR-02 consumes migrations `0006` + `0007` as-is). `CatalogModule` is now
wired into `AppModule`.

Supporting changes PR-02 made deliberately, each with a single
justification: `zod-validation.ts` moved from `identity/http` to the shared
`apps/api/src/http/validation/` HTTP boundary now that a second module
consumes it; an `idempotency-conflict` (409) slug added to the problem
catalogue; `CapabilityGuard` now publishes the workspace/user ids it
already resolved so a gated handler in another module never re-implements
authentication.

**Open Founder decision:** which membership roles receive
`catalog:read`/`catalog:manage` by default. PR-02 deliberately left
`identity`'s `DEFAULT_ROLE_PERMISSIONS` untouched — no accepted artifact
specifies that mapping, and inventing one would be unauthorized product
policy. Until it is decided, Catalog capabilities must be granted by
writing them onto a membership's `permissions`.

No Scheduling/Booking/Calendar/Staff/Clients work exists yet; later Phase-2
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
