# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`5740fa00a7dbdc4d86e13f6fea5e7cadbb953b8e` — merged PR #65 (Phase 2 PR-03 —
Scheduling interval/recurrence domain). Issue #64 is closed. PR #63 (PR-02,
issue #60), PR #62 (PR-02A, issue #61) and PR #59 (PR-01, issue #58) merged
before it.

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

**Phase 2 PR-02 — Catalog API/contracts (issue #60) is merged** (PR #63).
Six endpoints
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

**Phase 2 PR-03 — Scheduling interval/recurrence domain (issue #64) is
merged** (PR #65). It is pure
domain only: `apps/api/src/modules/scheduling/domain/` holds the half-open
`[start,end)` interval value over `Temporal.Instant`, the
normalize/union/intersect/subtract algebra, IANA-zone validation with a
single documented DST resolution policy, and bounded weekly recurrence
expansion (`MAX_EXPANSION_HORIZON_DAYS = 370`); `scheduling/index.ts` is the
module public entry. DST: the repeated local hour resolves to the earlier
occurrence (`research.md` R-DST) and a missing local hour clamps to the
offset transition so the non-existent hour is skipped, never shifted
(FR-014). Cross-midnight recurrence is deliberately **not** implemented —
the merged planning authorises only per-local-day wall-time intervals.
`@js-temporal/polyfill@0.5.1` was added to `apps/api` (exact pin,
`docs/decisions/0002-version-pins.md`); the only other manifest change is a
`@slotnova/testing/property` alias in the root `vitest.config.ts` so the
fast lane resolves that subpath from source like every other workspace
import.

**Two Founder-approved continuations from PR-03, now authoritative:**
(1) `effectiveUntil` is **EXCLUSIVE** — persisted recurrence bounds are
`[effectiveFrom, effectiveUntil)`, so `effective_until = 2026-10-01`
produces no availability on 2026-10-01; (2)
`MAX_EXPANSION_HORIZON_DAYS = 370` is an operational/safety cap only, not a
product promise of one-year booking visibility, and must not be silently
widened.

**Phase 2 PR-04 — Scheduling persistence/API (issue #66) is complete** on
branch `phase-2/pr-04-scheduling-persistence-api`. Migration
`0008_scheduling.sql` adds `availability_patterns` and
`availability_exceptions` — workspace-scoped only (no
`resource_id`/`location_id`/`staff_id`), RLS enabled + FORCE + workspace
policy on both, app role granted SELECT + INSERT only because the approved
contract exposes no update/delete endpoint. No `btree_gist` and no
exclusion constraint: those belong to PR-06. Four endpoints under
`/v1/scheduling`: `GET|POST /availability-patterns`,
`POST /availability-exceptions`, `POST /availability/resolve`, gated by
`scheduling:read` (list/resolve) and `scheduling:manage` (writes) through
the existing `CapabilityGuard`. `resolve` is a pure query that composes the
merged PR-03 domain and reimplements none of its recurrence/DST/interval
logic; it rejects an inverted range or one above 370 days with a 422 before
any database access. `SchedulingModule` is wired into `AppModule`.

**Open Founder decisions carried by PR-04:**
1. **Pattern-history precedence (new).** PR-04 found no accepted artifact
   defining precedence between two simultaneously-effective availability
   patterns, and did not invent one. It instead **proposes** the invariant
   the approved model already implies (`spec.md` Key Entities "one pattern
   set per workspace"; `contracts/scheduling.contract.md` "at most the
   workspace's single active pattern set"; `tasks.md` PR-04 "the
   workspace's single pattern"): creating a pattern whose effective window
   overlaps an existing one is rejected with 422, so precedence never
   arises. Enforced in the application layer under a per-workspace
   transaction advisory lock; promoting it to a database `EXCLUDE`
   constraint is a one-line additive migration once PR-06 installs
   `btree_gist`. **Needs Founder ratification.**
2. **Role→capability mapping.** Which membership roles receive
   `scheduling:read`/`scheduling:manage` by default is unspecified, exactly
   like the still-open `catalog:read`/`catalog:manage` question. PR-04
   deliberately left `identity`'s `DEFAULT_ROLE_PERMISSIONS` untouched;
   grant by writing the capability onto a membership's `permissions`.

No Booking/Calendar/Staff/Clients work exists yet; later Phase-2 slices
(PR-05 through PR-10) remain not implemented.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
