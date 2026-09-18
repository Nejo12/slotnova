# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`aed8552fbde9d3ca4a776eaa472e72e717711200` — merged PR #76 (Phase 2 PR-07A —
Booking list-window + contract reconciliation). Issue #75 is closed. PR #74
(PR-07, issue #73), PR #72 (PR-06, issue #70), PR #69 (PR-05, issue #68),
PR #67 (PR-04, issue #66), PR #65 (PR-03, issue #64), PR #63 (PR-02,
issue #60), PR #62 (PR-02A, issue #61) and PR #59 (PR-01, issue #58) merged
before it.

The Phase-2 Catalog, Scheduling and Booking APIs are complete: Catalog
(PR-01/PR-02), Scheduling (PR-03/PR-04/PR-05), Booking domain/overlap
(PR-06) and the Booking HTTP surface + generated contracts (PR-07/PR-07A).

Issue #77 (Phase 2 PR-08 — Booking frontend flow) is the active slice.
Issue #71 is a **closed duplicate of #70** and carries no separate work.

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

**Phase 2 PR-04 — Scheduling persistence/API (issue #66) is merged**
(PR #67). Migration
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

**Founder decision on PR #67 — pattern-history semantics (RATIFIED, now
authoritative):** a workspace may have effective-dated availability-pattern
history, but two pattern effective windows **must not overlap**; windows use
the approved half-open `[effectiveFrom, effectiveUntil)` semantics, so
adjacent windows are valid; there is **no** newest-wins/last-created-wins/
id-based precedence rule, because resolve must never have to choose between
two simultaneously-effective patterns. PR-04's per-workspace advisory-lock +
same-transaction overlap check is accepted for that slice. **PR-06 must
promote this invariant to a PostgreSQL `EXCLUDE` constraint in the same
additive migration that introduces `btree_gist`**, provided the semantics are
unchanged; the application check then remains only for friendly 422
translation. PR-05 deliberately did NOT promote it early — `btree_gist` is
PR-06's.

**Open Founder decision carried by PR-04 (item 1 below is now resolved, kept
for the record):**
1. **Pattern-history precedence — RESOLVED by the ratification above.**
   PR-04 found no accepted artifact
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
   `btree_gist`. **Ratified by the Founder on PR #67 (above).**
2. **Role→capability mapping.** Which membership roles receive
   `scheduling:read`/`scheduling:manage` by default is unspecified, exactly
   like the still-open `catalog:read`/`catalog:manage` question. PR-04
   deliberately left `identity`'s `DEFAULT_ROLE_PERMISSIONS` untouched;
   grant by writing the capability onto a membership's `permissions`.

**Phase 2 PR-05 — Booking aggregate/schema/state machine (issue #68) is
merged** (PR #69). Migration
`0009_booking.sql` adds the `booking_status` enum (exactly `confirmed`,
`completed`, `cancelled` — no `draft`, no `pending`), the IMMUTABLE
`public.booking_blocking_range()` helper and `public.bookings`: snapshotted
`service_duration_minutes`/`pre_buffer_minutes`/`post_buffer_minutes`, a
STORED GENERATED half-open `blocking_range` =
`[starts_at - pre, starts_at + duration + post)`, an optimistic `version`
(default 1), `cancelled_reason`, RLS enabled + FORCE + workspace policy, and
SELECT + INSERT + UPDATE for the app role (no DELETE — cancellation is a
state transition that keeps the historical row). `service_id` is an OPAQUE
Catalog reference with deliberately no foreign key; the only FK is the tenant
one. There is no `resource_id`/`location_id`/`staff_id`/`client_id` column.
`apps/api/src/modules/booking/` holds the pure aggregate, one
workspace-scoped repository whose three mutating statements each carry
`AND version = $expectedVersion AND status = 'confirmed'`, and four use
cases (`create`/`reschedule`/`cancel`/`complete`). There is **no
`BookingModule` and no HTTP/OpenAPI surface** — PR-07 adds both, exactly as
PR-03 shipped Scheduling's domain and PR-04 added the module with its
controllers. Deliberately absent: `btree_gist`, any exclusion constraint,
any overlap/concurrency proof (all PR-06), and any outbox/audit emission (no
Phase-2 consumer exists — `research.md`, FR-027).

**Founder-ratification note carried by PR-05 (resolved from the accepted
text, not invented):** `data-model.md`'s transition table contains a general
"`cancelled`/`completed` | any command | 409 terminal state" row AND
command-specific Idempotency cells granting a same-command no-op
("re-cancelling an already-`cancelled` booking with the same version is a
no-op success"; "re-completing with same version is a no-op success").
PR-05 reads the specific rows as exceptions to the general one, because each
command row's own Invalid-transition cell names only the OTHER terminal
state, `contracts/booking.contract.md` states the cancel no-op outright
("cancelling an already-`cancelled` booking with a matching version returns
`200` with the current state (no-op), not an error"), and `tasks.md` PR-05
requires tests for "idempotent no-ops **and** terminal-state rejection".
"Same version" is read as **matching the CURRENT row's version** (the
contract's own word is "matching"), so a naive retry carrying the
pre-transition version is a stale write, not a no-op. The version check runs
before the state check. If the Founder intended a blanket 409 on every
terminal-state command, only the two no-op branches need removing.

**Founder-ratified from PR-05 (now authoritative, do not revisit):** Booking
terminal-state retry semantics — a same-command no-op retry on an already
`cancelled`/`completed` booking succeeds only when the caller's version matches
the CURRENT row version; anything else is a 409 / stale-write.

**Phase 2 PR-06 — Booking overlap/concurrency (issue #70) is complete** on
branch `phase-2/pr-06-booking-overlap-concurrency`. One additive migration,
`0010_booking_overlap_exclusion.sql`, adds `btree_gist` plus TWO exclusion
constraints and touches nothing else (0001–0009 unmodified, no backfill, no
cleanup, no grant/policy/RLS change):

- `bookings_no_overlap` — `EXCLUDE USING gist (workspace_id WITH =,
  blocking_range WITH &&) WHERE (status = 'confirmed')`. Workspace-scoped, not
  global; partial, so `cancelled`/`completed` rows keep their history while
  occupying no capacity; keyed on 0009's STORED GENERATED half-open range, so
  a buffer-only overlap is caught exactly like a service overlap and half-open
  adjacency (`upper(a) = lower(b)`) is not a conflict. No
  `resource_id`/`location_id`/`staff_id`/`client_id` in the key — `workspace_id`
  remains the complete Phase-2 protected-resource key.
- `availability_patterns_no_overlapping_effective_window` — `EXCLUDE USING
  gist (workspace_id WITH =, (daterange(effective_from, effective_until,
  '[)')) WITH &&)`. This is the **promotion of the Founder-ratified PR #67
  pattern-history invariant** to the strongest boundary, with semantics
  unchanged: adjacent windows valid, overlapping invalid, NULL bounds
  unbounded, and still NO precedence/newest-wins rule anywhere.

The database — not application code — is the Booking overlap authority: no
check-then-insert companion exists. The only application change is a narrow
translation of SQLSTATE `23P01` **plus** the structured `constraint` field
into `BookingOverlapError` (new pure-domain error, exported from
`booking/index.ts`) in `bookings.repository.ts` `create`/`reschedule`;
`cancel`/`complete` move the row out of the partial predicate and so cannot
raise it. Scheduling's PR-04 advisory-lock check REMAINS as the friendly
deterministic 422 path, and a constraint violation that still reaches the
database is mapped onto the same `OverlappingEffectivePatternError`. Unrelated
integrity failures (23514, 23503, 42501) are rethrown untouched.

Concurrency is proved with genuinely independent `pg.Client` sessions driven to
an explicit barrier, with `pg_stat_activity` polled from a third connection
until PostgreSQL reports the second backend as waiting on a Lock; a companion
test issues both statements with no ordering at all and accepts either `23P01`
or a `40P01` deadlock-victim outcome. `0010` also has a clean-apply proof, a
populated-forward proof seeding bookings (confirmed/cancelled/completed) and
pattern windows, and an explicit production-safety proof that pre-existing
violating rows make the whole file roll back with 0010 unrecorded.

**No HTTP in PR-06**: no `booking.controller`, runtime schemas, OpenAPI paths,
generated contracts, `BookingModule` wiring, capability annotations or
problem+json filter — PR-07 owns all of them.

**Phase 2 PR-07 — Booking API/contracts (issue #73) is merged** (PR #74).
Six endpoints under `/v1/bookings`:
`GET|POST /bookings`, `GET /bookings/{id}` and
`POST /bookings/{id}/{reschedule,cancel,complete}`. There is no `/confirm`
route and no draft/pending state anywhere. `booking:read` gates the two
reads and `booking:create`/`booking:edit`/`booking:cancel`/`booking:complete`
gate the four writes, enforced by the existing server-authoritative
`CapabilityGuard`; as in PR-02/PR-04, `DEFAULT_ROLE_PERMISSIONS` is
deliberately untouched — the default role mapping for `booking:*` remains an
OPEN Founder product decision, and every test grants capabilities explicitly.

`POST /v1/bookings` requires an `Idempotency-Key` and runs the idempotency
claim, the Catalog Service snapshot read, the `bookings` insert and the stored
replay response in ONE PostgreSQL transaction, satisfying PR-02A's
same-transaction-only contract. Booking reaches Catalog through a new
Catalog-owned public port, `ServiceSnapshotPort` (`catalog/application/
service-snapshot.port.ts`, exported from `catalog/index.ts` and from
`CatalogModule`), whose `readInTransaction(tx, id)` runs on the CALLER's
transaction and returns exactly `{ id, active, durationMinutes,
preBufferMinutes, postBufferMinutes }` — no Catalog repository, schema or
cross-module join is reachable from `booking/`. A replay returns the stored
`201` before any INSERT, so it cannot collide with the booking it created.

Three problem slugs were added to the shared catalogue at the 409 the accepted
contract's conflict-type table gives each: `booking-overlap`, `stale-write`
and `invalid-transition`. `BookingOverlapError` responses restate the
REQUESTED blocking window only; the conflicting booking is never queried,
named or timed. The reschedule wording PR-07 flagged
(`booking.contract.md` said `422` for a source status that does not permit
reschedule, against its own conflict-type table's `409 invalid-transition`)
is repaired by PR-07A below.

**No schema migration in PR-07**: `0009`/`0010` are consumed unchanged, no
`0011` exists, and no Booking audit/outbox/event behaviour was added. No
Booking frontend and no Calendar work (PR-08/PR-09 own those).

**Phase 2 PR-07A — Booking list-window + contract reconciliation (issue #75)
is complete** on branch `fix/pr-07a-booking-list-window-contract`. It exists
only because two Founder-review corrections requested on PR #74 did not land
before that PR merged, and it fixes exactly those two things:

1. `GET /v1/bookings?from=&to=` filtered `starts_at >= from AND starts_at <
   to`. It now filters `blocking_range && tstzrange(from, to, '[)')` — the
   booking's OCCUPIED interval must overlap the requested window. A booking
   that begins before `from` but is still occupied inside the window (service
   duration reaching in, a post-buffer reaching in, or a booking crossing
   midnight) is now returned; a `starts_at`-only predicate hid exactly those,
   which would have made PR-09's Calendar composition show free time that is
   not free. The authoritative generated `blocking_range` that
   `bookings_no_overlap` excludes on is REUSED, never recomputed, so
   "visible in this window" and "occupies this window" cannot drift apart.
   Half-open adjacency is decided by PostgreSQL's own `'[)'` range semantics
   with no epsilon anywhere. Required `from`/`to`, the optional `status`
   filter, RLS/workspace scoping and `ORDER BY starts_at ASC, id ASC` are all
   unchanged, and no pagination/resource/staff/location/client filter was
   added.
2. `contracts/booking.contract.md`'s reschedule section now says `409
   invalid-transition` instead of `422`, matching its own conflict-type
   table, issue #73 and the already-shipped runtime behaviour. **No runtime
   error-mapping code changed** — this is doc reconciliation only. The same
   file's `GET /bookings` section now records the overlap window semantics so
   the ambiguity that produced correction 1 cannot recur.

**No schema migration** (no `0011`; `0009`/`0010` consumed as-is), no
frontend, no Calendar implementation, no capability/default-role change, no
state-machine change. The only generated-artifact delta is the one
`GET /v1/bookings` operation DESCRIPTION string in
`apps/api/openapi/openapi.json`, `packages/contracts/src/generated/
openapi.json` and `types.ts` — no path, parameter, schema or response shape
moved.

**Phase 2 PR-08 — Booking frontend flow (issue #77) is the active slice.**
It adds `apps/web/src/features/booking` — the first product feature in the
web SPA — consuming the generated `@slotnova/contracts` client only:

- routes `/bookings` (entry), `/bookings/new` (create) and
  `/bookings/:bookingId` (detail), reachable from the shell's Booking
  navigation item (desktop sidebar per Figma; under "More" on mobile, since
  the five-item mobile primary bar is a hard invariant).
- create journey Service -> start time -> check-answers Review -> submit,
  with Draft/Review held ENTIRELY in component state. No server-side draft
  or pending exists, so abandoning the flow creates nothing.
- one `Idempotency-Key` per intended submission: reused for a retry of the
  same Service+time, regenerated once either is materially edited.
- Booking detail with reschedule, cancel (destructive confirmation) and
  complete, each gated on the authoritative `GET /v1/me` capability list
  and on the booking's server-returned status.
- `booking-overlap`, `stale-write`, `invalid-transition`, `validation`,
  `forbidden` and `session-invalid` each render a distinct experience,
  branching only on the problem+json `type` slug.
- workspace-scoped query keys throughout (`wsKey`), so the shell's existing
  `queryClient.clear()` on workspace switch/logout is sufficient.

**No backend, schema, migration, contract-shape or default-role-mapping
change.** The only non-frontend edits are test-harness seed data
(`tooling/e2e/api-server.ts` grants the E2E memberships their Booking and
Catalog capabilities explicitly and seeds one active Service per workspace)
and Vitest MSW subpath aliases.

Later Phase-2 slices (PR-09 Calendar, PR-10 E2E/hardening/exit) remain not
implemented; no Calendar/Staff/Clients work exists yet. PR-08 provides the
Booking routes PR-09 will navigate into but implements no Calendar itself.

**Known contract defect, deliberately NOT fixed in PR-08** (it would be a
backend/contract change outside this slice): `BookingResponseDto_Output.
cancelledReason` and `ServiceListResponseDto_Output.nextCursor` are rendered
in the OpenAPI document as `array of string` although the runtime Zod
schemas declare them `string | null` (the list DTO's `cancelledReason`
renders correctly as `string | null`). The Booking frontend reads neither
field. This needs a Founder decision on where the nullable-rendering fix
belongs.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
