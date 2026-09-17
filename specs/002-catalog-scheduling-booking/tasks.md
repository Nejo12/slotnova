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
- **Constraints**: no check-then-insert as the sole protection (AGENTS.md
  hard prohibition) — this PR is exactly where that prohibition is load-
  bearing.
- **Out of scope**: API surface (PR-07).

## PR-07 — Booking API/contracts

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

## PR-08 — Booking frontend flow

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

## PR-09 — Calendar composition/UI

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
