# Tasks: Phase 2 — Catalog, Scheduling & Booking

Status: planning only. No task below is authorized to start until this
planning PR is Founder-approved/merged. All Founder-blocking decisions from
the first draft (Draft/Confirmed lifecycle, resource/staff scope, location
scope) plus the Clients-sequencing correction are now resolved — no task
below is blocked on a pending product decision.

## Task detail convention

Each task lists: dependency, files/areas, acceptance criteria, required
tests, constraints, out-of-scope. PR numbers are sequential and bounded —
no PR combines schema + API + UI for more than one module at a time.

## PR-01 — Catalog domain/schema foundation

- **Status**: Complete (issue #58). Migration `0006_catalog.sql` (`services`,
  `service_categories`, RLS+FORCE+policy, `services_category_workspace_fkey`
  composite FK); domain invariants (`domain/service.ts`,
  `domain/service-category.ts`, `domain/money.ts`); repository/application
  layer (`infrastructure/repositories/`, `application/`); no HTTP/contracts
  layer (PR-02 remains future work); no staff-service-capability or
  add-on table persisted, per the Founder-approved planning constraints.
- **Dependency**: none (starts from `main` post-Phase-1).
- **Files/areas**: `apps/api/src/modules/catalog/{domain,infrastructure}`,
  migration for `services`, `service_categories`.
- **Acceptance criteria**: Service CRUD-minus-delete (create/update/
  deactivate) at the domain/repository layer; duration/buffer/price
  validation; RLS enabled+forced on both new tables.
- **Required tests**: unit tests for validation invariants; real-PG RLS
  isolation test per table.
- **Constraints**: no staff-service-capability persistence and no
  service-add-on table — both are Founder-deferred (`research.md`
  R-SCOPE, R-ADDON); do not persist a table for either merely because the
  first draft proposed one.
- **Out of scope**: API endpoints (PR-02), Scheduling, Booking.

## PR-02A — Durable API idempotency foundation

- **Status**: Complete and merged (issue #61, PR #62). A corrective, unplanned insertion
  discovered mid-PR-02: the merged `contracts/catalog.contract.md`'s
  `POST /catalog/services` `Idempotency-Key` replay contract requires a
  durable, workspace-scoped claim/replay primitive that did not exist on
  `main` (no idempotency table, Redis, or dedup plugin). Adding it silently
  inside PR-02 would have been an unauthorized, undiscussed schema change
  in an API-only PR — this slice adds it deliberately and narrowly instead.
- **Dependency**: none (starts from `main` post-PR-01).
- **Files/areas**: `apps/api/src/modules/platform/idempotency/**`
  (`executeIdempotently` — the only exported entry point — plus canonical
  request fingerprinting), migration `packages/db/migrations/
  0007_platform_idempotency.sql` (`public.idempotent_requests`, RLS+FORCE+
  policy, `UNIQUE (workspace_id, operation, idempotency_key)`).
- **Acceptance criteria**: same workspace+operation+key+fingerprint runs the
  caller's business logic at most once and durably replays the stored
  result on retry; a different fingerprint under the same key/scope is a
  deterministic conflict; two independent DB connections racing the same
  key cannot both execute; a failed/rolled-back attempt does not poison the
  key for a later legitimate attempt. **Supports only mutations whose
  protected database side effects and replay record can be committed
  atomically in the same PostgreSQL transaction** — an earlier revision
  additionally supported a claim committed separately from its completion
  (with lease-based reclaim for an abandoned one); independent review found
  that split-transaction path unsafe (a caller that lost its claim to a
  reclaimer could still overwrite the reclaimer's result) and it was
  removed rather than patched. A future endpoint whose protected mutation
  cannot fit in one database transaction needs its own separately reviewed
  idempotency design.
- **Required tests**: canonical-fingerprint unit tests; real-PG migration
  clean/forward + RLS-coverage tests; true-concurrency test (two
  independent connections); durable-replay-across-a-new-process test;
  rollback/retry regression test (a failed attempt does not poison the key).
- **Constraints**: knows nothing about Catalog/Booking/Payments — only an
  opaque `operation` string; no Redis/distributed-lock framework; no
  lease/claim-expiry/reclaim mechanism; no Catalog controller/endpoint work
  (that remains PR-02).
- **Out of scope**: `POST /catalog/services` itself and every other Catalog
  endpoint (PR-02, which resumes once this merges), Scheduling, Booking.

## PR-02 — Catalog API/contracts

- **Status**: Complete (issue #60). Resumed and delivered once PR-02A
  merged. Six endpoints live under `/v1/catalog`
  (`GET|POST /services`, `GET|PATCH /services/{id}`,
  `GET|POST /categories`), capability-gated by the existing
  `CapabilityGuard`, with `problem+json` failures and no schema migration
  (consumes `0006` + `0007` as-is).
- **Dependency**: PR-01, **PR-02A** (durable API idempotency foundation —
  `POST /catalog/services`'s `Idempotency-Key` contract consumes
  `apps/api/src/modules/platform/idempotency/executeIdempotently`; PR-02
  does not add its own idempotency persistence).
- **Files/areas**: `apps/api/src/modules/catalog/{http,application,domain/policy}`,
  narrow RLS-scoped repository list methods, `CatalogModule` wiring into
  `AppModule`, generated OpenAPI delta, `packages/contracts` regeneration.
  Supporting moves: `zod-validation.ts` relocated from `identity/http` to
  the shared `apps/api/src/http/validation/` boundary (second consumer);
  `idempotency-conflict` added to the problem catalogue; `CapabilityGuard`
  now publishes the resolved workspace context to the authorized handler.
- **Acceptance criteria**: endpoints per `contracts/catalog.contract.md`
  live, capability-gated, `problem+json` failures. **Met.**
- **Required tests**: Nest integration tests against real PostgreSQL;
  contract-drift test (generated client matches committed OpenAPI);
  authorization tests (missing-capability → 403). **All present**, plus
  idempotency replay/conflict proofs asserted on `services` row counts, not
  only on matching HTTP responses.
- **Constraints**: no hand-written DTOs duplicating the runtime schema; no
  add-on or staff-capability endpoints.
- **Open Founder decision (not made here)**: which membership roles receive
  `catalog:read`/`catalog:manage` by default. Enforcement is complete and
  server-authoritative; `identity`'s `DEFAULT_ROLE_PERMISSIONS` is
  deliberately unchanged because no accepted artifact specifies that
  mapping.
- **Out of scope**: Catalog management UI (deferred unless a later PR
  demonstrates Phase-2 UI needs it beyond service selection in Booking).

## PR-03 — Scheduling interval/recurrence domain

- **Status**: Complete (issue #64). `apps/api/src/modules/scheduling/domain/`
  only — `interval.ts` (immutable half-open `[start,end)` value over
  `Temporal.Instant`), `interval-set.ts`
  (normalize/union/intersect/subtract), `wall-clock.ts` (IANA validation +
  the single documented DST resolution policy), `recurrence.ts` (weekly
  local-time rules, bounded expansion, `MAX_EXPANSION_HORIZON_DAYS = 370`),
  `scheduling-errors.ts`, plus `scheduling/index.ts` as the module public
  entry. `@js-temporal/polyfill@0.5.1` added to `apps/api` (exact pin per
  `docs/decisions/0002-version-pins.md`); no other dependency moved. **No
  migration, no repository, no HTTP/OpenAPI layer, no NestJS module, no
  Booking awareness, no `resourceId`/`locationId`/`staffId`** — all of that
  is PR-04+. DST policy: repeated local hour → earlier occurrence
  (`research.md` R-DST); missing local hour → clamped to the offset
  transition, so an occurrence inside the gap is skipped rather than shifted
  (FR-014). Cross-midnight recurrence was **not** implemented: the merged
  planning authorises only per-local-day wall-time intervals.
- **Dependency**: none beyond Phase-1 platform (can run parallel to
  PR-01/02).
- **Files/areas**: `apps/api/src/modules/scheduling/domain` — pure
  interval algebra (normalize/merge/intersect/subtract), recurrence
  expansion using `@js-temporal/polyfill`, DST disambiguation per
  `research.md` R-DST.
- **Acceptance criteria**: FR-010–FR-015 satisfied at the domain layer,
  independent of persistence, with no resource/location dimension.
- **Required tests**: fast-check property tests for normalize/merge/
  intersect/subtract, half-open adjacency, DST forward-gap and
  repeated-hour cases, bounded expansion horizon.
- **Constraints**: no `Date` usage; no persistence in this PR; no
  `resourceId`/`locationId` parameter anywhere in the domain API.
- **Out of scope**: API, Booking, persistence.

## PR-04 — Scheduling persistence/API

- **Status**: Complete (issue #66). Migration
  `packages/db/migrations/0008_scheduling.sql` creates
  `availability_patterns` + `availability_exceptions` (both workspace-scoped
  only, RLS enabled + FORCE + workspace policy, app role granted SELECT +
  INSERT only because the contract has no update/delete endpoint). Four
  endpoints under `/v1/scheduling`: `GET|POST /availability-patterns`,
  `POST /availability-exceptions`, `POST /availability/resolve`.
  `scheduling:read` gates the list and resolve, `scheduling:manage` the
  writes, via the existing `CapabilityGuard`. `resolve` composes the merged
  PR-03 domain only — it reimplements no recurrence, DST, normalisation or
  interval-subtraction logic — and rejects a range over
  `MAX_EXPANSION_HORIZON_DAYS` (370) before any database access.
  `effectiveUntil` is EXCLUSIVE end to end. **Pattern-history invariant
  (PROPOSED, awaiting Founder ratification):** a new pattern whose effective
  window overlaps an existing one is rejected (422), so at most one pattern
  is ever effective on a date and no precedence rule between simultaneously
  effective patterns is needed — or invented. It is enforced in the
  application layer under a per-workspace transaction advisory lock rather
  than by an `EXCLUDE` constraint, because `btree_gist` belongs to PR-06.
  No `btree_gist`, no Booking/Calendar/Catalog reference, no
  `resource_id`/`location_id`/`staff_id`.
- **Dependency**: PR-03.
- **Files/areas**: `apps/api/src/modules/scheduling/{infrastructure,http}`,
  migration for `availability_patterns`, `availability_exceptions` (both
  workspace-scoped only — no `resource_id`/`location_id` column).
- **Acceptance criteria**: endpoints per `contracts/scheduling.contract.md`
  live; `resolve` endpoint applies exceptions over the workspace's single
  pattern per documented precedence.
- **Required tests**: real-PG RLS isolation; integration tests for
  pattern+exception interaction; contract tests.
- **Constraints**: no Booking awareness in this module; no location/staff
  persistence of any kind (Founder decisions 3 & 4).
- **Out of scope**: Booking, Calendar.

## PR-05 — Booking aggregate/schema/state machine

- **Status**: Complete (issue #68). Migration
  `packages/db/migrations/0009_booking.sql` creates the `booking_status` enum
  (exactly `confirmed`/`completed`/`cancelled`), the immutable
  `public.booking_blocking_range()` helper and `public.bookings` — with the
  STORED GENERATED half-open `blocking_range`, the snapshot columns, the
  `version` column, RLS enabled + FORCE + workspace policy, and the app role
  granted SELECT + INSERT + UPDATE (never DELETE; cancellation is a state
  transition that keeps the historical row). `apps/api/src/modules/booking/`
  holds the pure aggregate (`domain/`), one workspace-scoped repository whose
  three mutating statements each carry `AND version = $expectedVersion`, and
  four use cases. **Same-command idempotent no-ops are implemented** —
  `cancel` on `cancelled` and `complete` on `completed`, each only when the
  caller's version matches the CURRENT row — because the command rows'
  Idempotency cells in `data-model.md`, `contracts/booking.contract.md`'s
  explicit cancel bullet and this task's own "including idempotent no-ops"
  requirement all say so; the blanket terminal-state row governs every other
  combination, which is rejected. No HTTP/OpenAPI/contracts, no
  `BookingModule` (PR-07 adds both), no `btree_gist`, no exclusion
  constraint, no outbox/audit emission (no Phase-2 consumer exists —
  `research.md`, FR-027), and no `resource_id`/`location_id`/`staff_id`/
  `client_id` column.
- **Dependency**: PR-01 (Service reference), PR-03 (interval algebra
  reused for blocking-range computation).
- **Files/areas**: `apps/api/src/modules/booking/domain`, migration for
  `bookings` (without the exclusion constraint yet — see PR-06). Enum:
  `confirmed`/`completed`/`cancelled` only.
- **Acceptance criteria**: state machine per `data-model.md` transition
  table implemented and enforced at the domain layer — `CreateBooking`
  produces `confirmed` directly; no `draft`/`pending` state or
  `ConfirmBooking` command exists; `version` column and
  optimistic-concurrency guard present; **no `client_id` column or
  reference of any kind**.
- **Required tests**: table-driven valid/invalid transition unit tests
  covering every row in the transition table, including idempotent no-ops
  and terminal-state rejection; an explicit test asserting `CreateBooking`
  never produces anything other than `confirmed`.
- **Constraints**: no HTTP layer, no exclusion constraint yet (isolates
  the state-machine proof from the concurrency proof for clean review); no
  `resource_id`/`location_id`/`client_id` column.
- **Out of scope**: overlap prevention (PR-06), API (PR-07), any
  Clients-domain integration (Phase 3).

## PR-06 — Booking overlap/concurrency

- **Status**: Complete (issue #70). Migration
  `packages/db/migrations/0010_booking_overlap_exclusion.sql` is the single
  additive migration: `CREATE EXTENSION IF NOT EXISTS btree_gist`,
  `bookings_no_overlap` (`EXCLUDE USING gist (workspace_id WITH =,
  blocking_range WITH &&) WHERE (status = 'confirmed')`) and
  `availability_patterns_no_overlapping_effective_window`
  (`EXCLUDE USING gist (workspace_id WITH =,
  (daterange(effective_from, effective_until, '[)')) WITH &&)`). Migrations
  0001–0009 are untouched and no backfill/cleanup step exists. The Booking
  constraint — not any application check — is the overlap authority; the only
  application code added is a narrow translation of SQLSTATE `23P01` **plus**
  `constraint = 'bookings_no_overlap'` into the new pure-domain
  `BookingOverlapError` (PR-07 maps it to `409 booking-overlap`; no HTTP,
  OpenAPI, contracts, `BookingModule` or problem filter was added here).
  **Scheduling invariant promotion**: the Founder-ratified pattern-history
  invariant from PR #67 is now enforced by the database as well. Semantics are
  unchanged — half-open `[effective_from, effective_until)`, adjacent windows
  valid, overlapping invalid, NULL bounds unbounded, and still no
  precedence/newest-wins rule. PR-04's per-workspace advisory-lock check stays
  as the friendly deterministic 422 path, and a violation that still reaches
  the database is mapped back onto the same
  `OverlappingEffectivePatternError`.
- **Dependency**: PR-05.
- **Files/areas**: migration adding `btree_gist` + the exclusion
  constraint keyed on `(workspace_id, blocking_range)`
  (`research.md` R-EXCL), application-layer translation of the DB conflict
  into a domain/`problem+json` `booking-overlap` response.
- **Acceptance criteria**: SC-001 and SC-003 satisfied, proven within a
  single workspace; a companion test proves two different workspaces do
  **not** conflict for the same wall-clock time (validates the key is
  workspace-scoped, not global).
- **Required tests**: **real PostgreSQL, two independent concurrent
  connections**, attempting conflicting blocking bookings within one
  workspace — proves at most one commits. A second concurrency test
  proves the optimistic-concurrency `version` guard (PR-05) under
  concurrent edits to the same row. Sequential-call tests are explicitly
  insufficient and will be rejected in review.
  *Delivered in `booking/__tests__/overlap-concurrency.int.test.ts` and
  `scheduling/__tests__/pattern-history-exclusion.int.test.ts`: every race uses
  `openIndependentConnections` (separate `pg.Client` sessions), drives both
  transactions to an explicit barrier, and polls `pg_stat_activity` from a
  third connection until PostgreSQL itself reports the second backend as
  waiting on a Lock — so a race that silently degraded into sequential calls
  would fail rather than pass. A companion test issues both statements
  simultaneously with no ordering at all and accepts either `23P01` or a
  `40P01` deadlock-victim outcome, because both are the database arbitrating.*
- **Constraints**: no check-then-insert as the sole protection (AGENTS.md
  hard prohibition) — this PR is exactly where that prohibition is load-
  bearing.
- **Out of scope**: API surface (PR-07).

## PR-07 — Booking API/contracts

- **Status**: Complete (issue #73). Six endpoints under `/v1/bookings`:
  `GET|POST /bookings`, `GET /bookings/{id}` and
  `POST /bookings/{id}/{reschedule,cancel,complete}`. No `/confirm` route and
  no draft/pending state. `booking:read` gates the reads;
  `booking:create`/`booking:edit`/`booking:cancel`/`booking:complete` gate the
  writes through the existing `CapabilityGuard`, with
  `DEFAULT_ROLE_PERMISSIONS` deliberately untouched (the default role mapping
  stays an open Founder decision, as in PR-02/PR-04). `POST /bookings`
  requires an `Idempotency-Key` and runs the claim, the Catalog Service
  snapshot read, the `bookings` insert and the stored replay response in ONE
  transaction — the Service snapshot arrives through a new Catalog-owned
  public port (`ServiceSnapshotPort`) that takes the caller's transaction, so
  Booking imports no Catalog repository/schema and issues no cross-module
  join. `booking-overlap`, `stale-write` and `invalid-transition` were added
  to the shared problem catalogue at 409 each; the overlap response restates
  the REQUESTED window only and never queries the conflicting booking.
  **No schema migration** (0009 + 0010 consumed as-is), no Booking
  audit/outbox behaviour, no frontend. **Corrected by PR-07A** (below): as
  merged, `GET /bookings` filtered the window on `starts_at`, not on the
  booking's occupied interval.
- **Dependency**: PR-06.
- **Files/areas**: `apps/api/src/modules/booking/http`, runtime schemas,
  OpenAPI/`packages/contracts` regeneration.
- **Acceptance criteria**: endpoints per `contracts/booking.contract.md`
  live (`POST /bookings` creates directly at `confirmed`; no `/confirm`
  endpoint); idempotency-key handling on create; capability-gated per
  action.
- **Required tests**: Nest integration tests against real PostgreSQL for
  every endpoint and every `problem+json` conflict type; contract-drift
  test; a test asserting the request schema rejects an unexpected
  `clientId`/`resourceId`/`locationId` field rather than silently
  accepting and ignoring it.
- **Constraints**: no GET for any mutating action; no client/resource/
  location field anywhere in the request/response schema.
- **Out of scope**: frontend (PR-08).

## PR-07A — Booking list-window + contract reconciliation

- **Status**: Complete (issue #75). A bounded corrective slice for the two
  Founder-review corrections that did not land before PR #74 merged.
  (1) `GET /v1/bookings?from=&to=` now selects bookings whose stored
  `blocking_range` OVERLAPS the requested half-open window
  (`blocking_range && tstzrange(from, to, '[)')`) instead of filtering
  `starts_at >= from AND starts_at < to`, so a booking that begins before
  `from` but is still occupied inside the window — duration, post-buffer or a
  crossing booking — is returned, which is what `calendar.contract.md`'s
  occupied-interval composition (PR-09) depends on. The authoritative
  generated column `bookings_no_overlap` excludes on is reused, not
  recomputed; half-open adjacency is proved through PostgreSQL's own `'[)'`
  range semantics with no epsilon. Required bounds, the optional `status`
  filter, RLS scoping and `ORDER BY starts_at ASC, id ASC` are unchanged, and
  no pagination/resource/staff/location/client filter was added.
  (2) `contracts/booking.contract.md`'s reschedule failure prose now reads
  `409 invalid-transition` instead of `422`, matching its own conflict-type
  table and the shipped runtime behaviour — **doc reconciliation only, no
  runtime error-mapping change** — and its `GET /bookings` section now
  records the overlap window semantics. **No schema migration**, no frontend,
  no Calendar implementation, no capability/default-role change.
- **Dependency**: PR-07.
- **Files/areas**: `booking/infrastructure/repositories/bookings.repository.ts`,
  `booking/http` (boundary/OpenAPI documentation only),
  `contracts/booking.contract.md`.
- **Acceptance criteria**: a booking whose occupied interval crosses into the
  requested window is listed; adjacency at either bound is not.
- **Required tests**: real-PostgreSQL HTTP proofs for the half-open boundary
  table (overlap in, upper bound touching `from` out, lower bound touching
  `to` out), a post-buffer-only crossing case, status filter composed with
  overlap, deterministic ordering and workspace isolation.
- **Out of scope**: everything else in PR-07, and all of PR-08+.

## PR-08 — Booking frontend flow

- **Status**: Complete (issue #77). `apps/web/src/features/booking` adds the
  routes `/bookings`, `/bookings/new` and `/bookings/:bookingId` over the
  generated `@slotnova/contracts` client. The create journey is Service ->
  start time -> check-answers Review -> submit, with Draft/Review held
  purely in component state — no server-side draft or pending exists, and
  abandoning the flow creates nothing. One `Idempotency-Key` per intended
  submission: reused for a retry of the same Service+time, regenerated once
  either is materially edited. Detail exposes reschedule, cancel (with the
  shared destructive confirmation) and complete, each gated on the
  authoritative `GET /v1/me` capability list AND the booking's
  server-returned status, so a terminal-state booking never presents an
  action that would be an invalid transition. `booking-overlap`,
  `stale-write`, `invalid-transition`, `validation`, `forbidden` and
  `session-invalid` each render a distinct experience, branching only on the
  problem+json `type` slug. All query keys are workspace-scoped via `wsKey`.
  No client/customer/staff/resource/location UI, no Calendar, **no backend,
  schema, migration, contract-shape or default-role-mapping change** — the
  only non-frontend edits are E2E harness seed data and Vitest MSW aliases.
- **Dependency**: PR-07 (generated client available).
- **Files/areas**: `apps/web/src/features/booking` — create/review/detail/
  cancel flow, TanStack Query workspace-scoped keys, SCSS Modules +
  semantic tokens.
- **Acceptance criteria**: primary path, Back, Cancel, destructive
  confirmation, loading, error recovery (including `booking-overlap` and
  `stale-write` distinguishable messaging), input preservation across
  Back/error (client-side only — there is no server-side Draft to
  preserve), keyboard/focus behavior, touch targets, Light/Dark, reduced
  motion — all per FR-020–FR-029 and the AGENTS.md hard invariants. **The
  flow does not include a client/customer-selection step** — no
  Clients-domain functionality is implemented or assumed; that belongs to
  Phase 3 (`research.md` R-CLIENTS).
- **Required tests**: component tests for each state (loading/error/
  overlap-conflict/stale-write-conflict); axe automated checks;
  keyboard-only interaction test; a test asserting no client-selection UI
  is rendered in the Phase-2 flow.
- **Constraints**: no Tailwind; no client-side authorization shortcuts
  (server remains authoritative); no speculative client-picker component
  built "for later."
- **Out of scope**: Calendar UI (PR-09), any Clients-domain UI.

## Corrective — OpenAPI nullable scalar generation (issue #79)

- **Status**: Complete and merged (PR #80), between PR-08 and PR-09. Not a
  numbered slice of this plan: it repaired a contract-generation defect PR-08
  found and recorded, where six top-level response properties declared
  `string | null` at runtime were published as `array of string`. Fixed
  generically by the project-owned `createZodDto`
  (`apps/api/src/http/openapi/zod-dto.ts`), which every boundary schema —
  PR-09's included — now imports instead of `nestjs-zod` directly. No
  runtime, endpoint, serialization or schema change.

## PR-09 — Calendar composition/UI

- **Status**: Complete and **merged** (PR #82, issue #81 closed,
  merge commit `cd95b82`). ONE thin read-composition endpoint,
  `GET /v1/calendar?from=&to=`, in `apps/api/src/modules/calendar-read/`
  (`application/` + `http/` only — no `domain/`, no `infrastructure/`, no
  table, **no migration**). It composes two newly published application
  ports, `AvailabilityReadPort` (Scheduling) and `BookingOccupancyPort`
  (Booking), each the only provider its module exports, mirroring PR-07's
  Catalog `ServiceSnapshotPort`. Both delegate verbatim to the use cases the
  existing endpoints already use, so Scheduling keeps sole authority over
  recurrence/DST/exceptions/horizon and Booking keeps sole authority over
  `blocking_range` overlap, status and identity; PR-07A's crossing-window
  semantics are inherited, not re-derived. Booking (not Calendar) excludes
  `cancelled` from occupancy, matching `bookings_no_overlap`'s partial
  predicate. The request window is absolute instants; Scheduling is asked for
  the UTC-date span widened one day each side (UTC offsets reach ±14h) and
  clipped back with Scheduling's own `intersectIntervals`, with the 370-day
  guard applied to that widened window — so a Calendar window may be up to
  368 days and 369+ is a 422, never a silent clamp. The route requires BOTH
  `booking:read` and `scheduling:read`: `@RequireCapability` was widened to
  take a list and `CapabilityGuard` now requires every entry (stacking two
  decorators would have silently kept one). `DEFAULT_ROLE_PERMISSIONS`
  remains untouched. Failures are coherent and never partial — 401 / 403 /
  422 / canonical `internal` 500. **Contract reconciliation recorded, not
  silently changed:** `calendar.contract.md` words the underlying-failure
  case as "502/503-mapped"; both halves are in-process application ports in
  the shipped modular monolith, so the existing `internal` slug is used and
  no `bad-gateway` slug was invented — the required behaviour (canonical
  problem+json, no partial data, explicit frontend error+retry) is unchanged.
  Frontend `apps/web/src/features/calendar/` replaces the `/calendar`
  placeholder with ONE bounded day mode (`?day=YYYY-MM-DD`, malformed
  degrades to today), a desktop timeline and a deliberately different mobile
  agenda chosen at render time, four distinct states, colour-independent
  labelling, a semantic list of buttons rather than a fake ARIA grid, and
  workspace+range-scoped query keys. Occupied entries navigate to PR-08's
  `/bookings/:bookingId`; open time enters `/bookings/new?startsAt=` through
  a client-side-only, safely-degrading search parameter. **Approved Figma was
  NOT reachable** (the Figma MCP server is unauthenticated in this
  environment — the same finding PR-08 recorded), so `docs/product-handoff.md`
  and the committed contracts were used as authority and the single-day mode
  is documented as a decision rather than inferred from absent visuals. No
  Clients/Recovery/Payments work, no resource/staff/location/client
  dimension, no mobile-IA change and no PR-10 work.
- **Dependency**: PR-04 (Scheduling resolve), PR-07 (Booking list/detail),
  and the composition endpoint from `research.md` R-CAL (thin
  `apps/api/src/modules/calendar-read` application service with no
  migration).
- **Files/areas**: `apps/web/src/features/calendar`; the one composition
  endpoint's `http`/`application` layers (no `infrastructure`/table
  layer).
- **Acceptance criteria**: FR-030–FR-032; desktop + mobile deliberate
  layouts; loading/empty/error/permission-restricted states; date
  navigation; booking-selection entry into the PR-08 create flow.
- **Required tests**: component tests for each Calendar state; contract
  test for the composition endpoint; a11y checks; visual regression
  limited to stable primitives (day/slot cell, state banners) — not the
  full dynamic grid (AGENTS.md testing guidance).
- **Constraints**: no Calendar persistence table under any circumstance;
  no `resourceId` query parameter.
- **Out of scope**: Recovery/Retention surfaces referenced elsewhere in
  the mobile IA (`More`, `Recovery` nav items) — Calendar only.

## PR-10 — Phase-2 E2E/hardening/exit

- **Status**: Implemented and locally verified (issue #83); **not yet merged** —
  the Founder performs every merge manually, so this slice is marked complete
  only once that merge lands. Evidence-first, not a feature PR: the SC-001…
  SC-011 matrix was built from the merged Phase-2 corpus BEFORE any code was
  written, and **exit validation found no defect in accepted Phase-2
  behaviour** — no product code, schema, migration, contract shape, RLS policy,
  capability rule or default role mapping was changed. The one defect it did
  find is low-severity tooling hygiene: `storybook-static/` was missing from
  ESLint's and Stylelint's own ignore lists, so building Storybook and then
  running `verify:fast` in the same checkout failed on vendored bundles; fixed
  with one ignore entry in each config, beside the existing `dist` entry, with
  no rule relaxed. Three genuine *evidence*
  gaps were closed with bounded tests: (1) reschedule had no integrated
  real-browser/real-PostgreSQL journey and (2) no E2E ran at a ≤400px viewport,
  both closed by `apps/web/e2e/journey-10-reschedule-mobile.spec.ts`; (3)
  SC-005's "100%" quantifier was unproven — every tenant table had a
  hand-written suite, but each asserted only the tables it already knew about,
  closed by `apps/api/src/test/isolation/tenant-table-census.int.test.ts`, which
  discovers tenant ownership from the live PostgreSQL catalog (NOT NULL
  `workspace_id`) instead of from a list. A fourth, smaller gap — the reschedule
  panel was the one changed interactive flow with no axe run and no
  keyboard-only assertion — was closed inside the existing
  `booking-a11y.test.tsx`. The full evidence matrix, the Phase-2 Founder
  decision register and the exit assessment are in `docs/phase-2-exit.md`. The
  default role→capability mapping remains an **open Founder product decision**
  and is recorded there as deferred: it is assessed as NOT an exit blocker
  because capabilities are already enforced server-authoritatively through
  explicit membership `permissions`, and no accepted artifact specifies a
  default mapping.
- **Dependency**: PR-01…PR-09.
- **Files/areas**: `apps/web` Playwright specs, `.slotnova/CURRENT.md`,
  `docs/decisions/000X-*.md` Phase-2 exit records (including a record of
  the Founder decisions applied in this planning revision), `docs/
  phase-2-exit.md` (new, mirroring `docs/phase-1-exit.md`'s
  evidence-matrix format).
- **Acceptance criteria**: all success criteria in `spec.md` demonstrably
  pass with recorded evidence, mirroring the Phase-1 exit precedent.
- **Required tests**: the critical E2E set (create/confirm booking,
  cancel booking, workspace-switch isolation, conflicted-slot handling);
  full quickstart re-run.
- **Constraints**: no scope creep into Phase 3 (Clients/Notifications/
  Messaging) work.
- **Out of scope**: everything listed in `spec.md`'s Out of Scope section.

## Dependencies & Execution Order

### Phase order

PR-01/02 (Catalog) and PR-03 (Scheduling domain) can run in parallel.
PR-04 depends on PR-03. PR-05 depends on PR-01 + PR-03. PR-06 depends on
PR-05. PR-07 depends on PR-06. PR-08 depends on PR-07. PR-09 depends on
PR-04 + PR-07. PR-10 depends on all. No task is gated on a pending Founder
decision — all such decisions are resolved as of this revision.

### Parallel opportunities

- PR-01/02 and PR-03 (no shared files, no shared schema).
- Within PR-08/PR-09 frontend work, component-test authoring can start
  against contract mocks (MSW) before the corresponding backend PR merges,
  per the existing Phase-1 contracts-pipeline convention.

### No mega-PR

No single PR combines schema + API + UI for more than one module; PR-05/
PR-06 deliberately split the state-machine proof from the concurrency
proof so each is independently reviewable, matching the rigor ADR-011
demands for the highest-risk invariant in this feature. The
Founder-corrected model (single implicit resource, no location, no
client, no draft/pending) makes every task smaller and more bounded than
the first draft, not larger.
