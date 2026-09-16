# Quickstart — Validating Phase 2 (Catalog, Scheduling & Booking)

This is a reviewer guide for validating Phase 2 **once implementation
lands**; none of the commands below are runnable against this planning PR
(no product code ships here). Commands map to the repository's existing
verification mechanisms (Phase-1 precedent:
`specs/001-platform-foundation-shell/quickstart.md`).

## Prerequisites

- Node LTS via nvm (this repo pins Node 24; default shell Node may be
  older — use the repo's `nvm use` path).
- Docker available for Testcontainers-backed PostgreSQL.

## 1. Catalog (SC-005 RLS, FR-001–FR-007)

```bash
pnpm --filter @slotnova/api test -- catalog
```

Confirms: service create/update/deactivate, duration/buffer/price
validation, staff-service capability association, and RLS isolation for
`catalog.services`/`catalog.service_categories`/`catalog.service_add_ons`/
`catalog.staff_service_capabilities`.

## 2. Scheduling interval algebra & DST (SC-002, SC-004)

```bash
pnpm --filter @slotnova/api test -- scheduling --run-property
```

Confirms: normalize/merge/intersect/subtract property tests,
half-open-adjacency property test, DST forward-gap and repeated-hour
property tests (`research.md` R-DST).

## 3. Booking state machine (SC-006)

```bash
pnpm --filter @slotnova/api test -- booking --state-machine
```

Confirms: table-driven valid/invalid transition coverage matching
`data-model.md`'s state transition table, including terminal-state
rejection and idempotent no-op transitions (re-cancel, re-complete).

## 4. Real-PostgreSQL overlap + concurrency proof (SC-001, SC-003)

```bash
pnpm --filter @slotnova/api test:pg -- booking-overlap
```

Confirms (via Testcontainers + real PostgreSQL, **not** mocks):
- exclusion constraint migration applies cleanly
- two independent concurrent connections attempting overlapping blocking
  bookings for the same resource → exactly one commits
- a booking whose buffer-only range overlaps another's buffer-only range
  is rejected (SC-003)
- adjacent bookings (`end == start`) are accepted (SC-002)

## 5. Optimistic concurrency (R-OCC)

```bash
pnpm --filter @slotnova/api test:pg -- booking-version-conflict
```

Confirms: two concurrent edits to the same booking → second writer
receives `409 stale-write`, not a silent overwrite.

## 6. RLS isolation — Phase 2 tables (SC-005)

```bash
pnpm --filter @slotnova/api test:pg -- rls-isolation --module=catalog,scheduling,booking
```

Confirms 100% of the seven Phase-2 tenant-owned tables reject cross-
workspace read/write under RLS.

## 7. Contract generation determinism (SC-007)

```bash
pnpm --filter @slotnova/contracts generate
git diff --exit-code packages/contracts
```

Run twice; confirm no diff between runs (deterministic OpenAPI/client
generation) and that the generated output matches what's committed.

## 8. Booking + Calendar UI (SC-008, SC-009)

```bash
pnpm --filter @slotnova/web storybook
pnpm --filter @slotnova/web test -- booking calendar --a11y
```

Confirms: desktop + mobile (≤400px) layouts for booking create/review/
detail/cancel and Calendar loading/empty/error/permission-restricted
states; keyboard-only operation; zero critical axe violations; Light/Dark
token correctness; reduced-motion path.

## 9. Critical E2E journeys (issue #3 acceptance criteria)

```bash
pnpm --filter @slotnova/web e2e -- --grep "booking"
```

Confirms at minimum: create/confirm booking, cancel booking, workspace
switch shows no cross-workspace Phase-2 data, and a user attempting to
book an already-conflicted slot sees an explicit, recoverable conflict
message (not a silent failure).

## 10. Scope guard

```bash
git diff --stat origin/main...HEAD -- apps/ packages/
```

Confirms no Recovery/Payments/Notifications/Messaging/Staff-product-UI/
Inventory/Marketing/Analytics files were touched by any Phase-2 PR.

## Definition of done for Phase 2

All ten checks above pass; every open product question in `spec.md` is
either resolved by Founder decision and reflected in the merged code, or
explicitly deferred with a recorded rationale; `.slotnova/CURRENT.md`
reflects Phase 2 completion; Phase-2 exit decision records exist under
`docs/decisions/` mirroring the Phase-1 precedent.
