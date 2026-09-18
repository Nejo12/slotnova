# Phase 2 Exit Validation

Status: **All 11 success criteria (SC-001 … SC-011) demonstrably PASS.** Phase 2
exit criteria are met. Founder review and manual merge of the PR-10 pull request
is the remaining step to formally declare Phase 2 exited. Parent issue #3 is
deliberately NOT closed by this PR.

## Verification legend

- **Automated** — verified by a command run in this session, with the result recorded below.
- **CI evidence** — verified by a completed GitHub Actions run (cited by run ID/URL), not re-run locally.
- **Manual** — verified by direct inspection of source/config/diff in this session (not machine-checked).
- **N/A** — the criterion doesn't apply at this stage, with reasoning.
- **Unresolved** — could not be honestly validated in this environment.

## Context

- Base `main` SHA for this PR: `cd95b8269c5ce1a937da574399d50e845cc0e584` (PR #82 / PR-09 merged).
- Worktree: `/Users/olaniyiaborisade/Codes/slotnova-pr-10-e2e-exit`, branch
  `phase-2/pr-10-e2e-hardening-exit`, created fresh from verified `origin/main`.
- Phase-2 merged PR range (the bounded sequence `tasks.md` planned):

  | Slice | PR | Issue | Merge commit | Merged (UTC) |
  |---|---|---|---|---|
  | PR-01 Catalog domain/schema | [#59](https://github.com/Nejo12/slotnova/pull/59) | #58 | `a54d3cf` | 2026-09-16T21:31:59Z |
  | PR-02A Durable API idempotency | [#62](https://github.com/Nejo12/slotnova/pull/62) | #61 | `ac49545` | 2026-09-17T12:00:23Z |
  | PR-02 Catalog API/contracts | [#63](https://github.com/Nejo12/slotnova/pull/63) | #60 | `2804df4` | 2026-09-17T13:44:21Z |
  | PR-03 Scheduling domain | [#65](https://github.com/Nejo12/slotnova/pull/65) | #64 | `5740fa0` | 2026-09-17T14:18:03Z |
  | PR-04 Scheduling persistence/API | [#67](https://github.com/Nejo12/slotnova/pull/67) | #66 | `75babdc` | 2026-09-17T15:48:47Z |
  | PR-05 Booking aggregate/schema | [#69](https://github.com/Nejo12/slotnova/pull/69) | #68 | `cfdf680` | 2026-09-17T22:14:40Z |
  | PR-06 Overlap/concurrency | [#72](https://github.com/Nejo12/slotnova/pull/72) | #70 | `fa7072a` | 2026-09-17T23:05:22Z |
  | PR-07 Booking API/contracts | [#74](https://github.com/Nejo12/slotnova/pull/74) | #73 | `2cbef6c` | 2026-09-18T06:17:41Z |
  | PR-07A Booking list-window correction | [#76](https://github.com/Nejo12/slotnova/pull/76) | #75 | `aed8552` | 2026-09-18T06:45:00Z |
  | PR-08 Booking frontend | [#78](https://github.com/Nejo12/slotnova/pull/78) | #77 | `79d8bcf` | 2026-09-18T07:47:19Z |
  | Corrective — OpenAPI nullable scalars | [#80](https://github.com/Nejo12/slotnova/pull/80) | #79 | `de3cbe1` | 2026-09-18T08:18:03Z |
  | PR-09 Calendar composition/UI | [#82](https://github.com/Nejo12/slotnova/pull/82) | #81 | `cd95b82` | 2026-09-18T12:08:08Z |
  | PR-10 E2E hardening & exit | this PR | #83 | — | — |

  Two of these are **corrective** slices, not new scope: PR-07A repaired the
  `GET /v1/bookings` window predicate and one contract-doc inconsistency; PR #80
  repaired generated-OpenAPI nullable-scalar rendering. Both are counted in the
  sequence above rather than hidden.

- Required CI gates on `main`/PRs: `fast`, `e2e`, `heavy` (`migration-checklist`,
  `migration-proof`, `visual-regression`, `accessibility`, `security-scan-reference`,
  `budget-check`), `security`.
- Founder-approved heavy-lane pre-merge budget: **180 seconds**, recorded in
  `docs/standards/ci-quality-gates.md` and `docs/runbooks/perf-baselines.md`.
  Phase-1 observed baseline: 93s. **Not weakened by this PR.**
- Phase-2 aggregate diff vs. the Phase-1 exit merge (`2d556de` … `cd95b82`):
  190 files, +31 230 / −243, five additive migrations (`0006`…`0010`).

## Local validation results

Fresh worktree, Node 24.20.0 (repo requires Node 24; the default shell node is v22 —
`source ~/.nvm/nvm.sh && nvm use 24`).

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean install, no errors |
| `pnpm verify:fast` | **9/9 PASS**, 38.5s (format, ESLint, Stylelint, dependency-cruiser boundaries, typecheck, unit/property tests, build, contract-drift, OpenAPI breaking-change) |
| `pnpm verify:integration` | **2/2 PASS**, 169.3s (real-PostgreSQL/Testcontainers integration 148.5s; Playwright journeys 20.8s) |
| `pnpm e2e` | **13/13 PASS**, 21.5s, run standalone |
| `pnpm contracts:check` | PASS — committed generated artifacts match current source, 0 drift |
| `pnpm contracts:check:breaking` | PASS — no breaking OpenAPI changes vs. merge-base |
| `pnpm lint:boundaries` | PASS — 0 violations, 509 modules / 1510 dependencies cruised |
| `git diff --check` | clean, no whitespace errors |

Targeted suites, run individually for direct per-SC citation (all real PostgreSQL
via Testcontainers where marked):

| Suite | Result |
|---|---|
| `booking/__tests__/overlap-concurrency.int.test.ts` + `booking/__tests__/schema.int.test.ts` + `scheduling/__tests__/pattern-history-exclusion.int.test.ts` (real PG) | **62/62 PASS**, 14.2s |
| Scheduling domain: `interval-algebra.property`, `recurrence-dst`, `recurrence`, `interval`, `interval-set`, `expansion-range` | **84/84 PASS** |
| `booking/__tests__/booking.test.ts` (state-machine matrix) | **47/47 PASS** |
| `apps/api/src/test/isolation/*` + `catalog/schema.int` + `scheduling/schema.int` + `platform/idempotency/idempotent-execution.int` (real PG) | **74/74 PASS** across 7 files |
| `packages/db/src/testing/__tests__/rls-coverage.int.test.ts` (real PG) | **2/2 PASS** |
| Booking/Catalog/Scheduling/Calendar HTTP integration (real PG) | **176/176 PASS** across 8 files |
| `apps/web/src/features/**` (Booking + Calendar component/a11y/unit) | **123/123 PASS** across 10 files |

**Deterministic contract generation** (SC-007), run explicitly rather than only via
the drift check: `pnpm contracts:generate` twice in succession. After each pass
`git status --porcelain` was empty and the MD5s of `apps/api/openapi/openapi.json`
(`4d316cb5…`), `packages/contracts/src/generated/openapi.json` (`ef4197de…`) and
`packages/contracts/src/generated/types.ts` (`db269847…`) were byte-identical across
both passes. No generated file was hand-edited in this PR.

**Visual regression**: the committed baselines are Linux-only
(`*-chromium-linux.png`, 18 files). The first local run on macOS wrote a parallel
set of `*-chromium-darwin.png` baselines (Playwright's behaviour for a missing
platform) and the second run passed **18/18** against them — i.e. every stable
`System States/*` story renders Light and Dark without error on this machine — but
those darwin files were **deliberately deleted and not committed**, exactly as the
Phase-1 precedent requires (`docs/phase-1-exit.md`, `docs/runbooks/perf-baselines.md`
record the same macOS-vs-`ubuntu-latest` rendering gap). **Authoritative evidence for
pixel comparison is the `visual-regression` job on `ubuntu-latest` in `heavy.yml`.**
No snapshot baseline was updated, and no dynamic Calendar-grid snapshot was added —
`calendar-primitives.test.tsx.snap` covers stable primitives only.

## Frontend exit review (real browser, real API, real PostgreSQL)

Beyond the committed journeys, a one-off scripted sweep was driven through the
same Chromium/Vite/API/PostgreSQL stack (`pnpm e2e`'s harness) and then deleted
rather than committed, because its purpose was observation, not regression
protection. Path exercised: sign in → workspace switch → Service → time →
Review → Confirm → detail → **page reload on the deep link** → Light/Dark on
detail → Calendar day with the composed open + occupied entries → Light/Dark on
Calendar → deep link back into Booking detail.

Observed:

- **Console errors: 0.** (`console` `error` events and `pageerror` both captured
  for the whole run.)
- **HTTP responses ≥ 400: 0.** No unexpected failed network request anywhere in
  the flow.
- **Light/Dark is genuinely token-driven**, read back from `getComputedStyle`
  rather than from stylesheet text: Booking detail `light` →
  `bg rgb(255,255,255)` / `fg rgb(33,26,27)`, `dark` → `bg rgb(3,7,18)` /
  `fg rgb(245,239,233)`; Calendar the same pair. Both surfaces respond to the
  root `data-theme` switch with no per-surface override.
- **Refresh / deep link preserves the Booking detail surface**, and re-entering
  the detail URL directly after leaving the Calendar renders it correctly.
- **Status is never colour-only** — every Booking and Calendar entry carries its
  state as a word ("Confirmed", "Cancelled", "Open", "Booked", "Completed"),
  asserted in the committed journeys.
- **The fixed mobile nav does not cover a primary action** — measured from real
  bounding boxes at 390px in `journey-10-reschedule-mobile.spec.ts`.
- **No client/customer picker and no Pending/Draft persisted state** appear on
  any surface.

One item could not be machine-read in this sweep: `getComputedStyle(el, ":focus-visible")`
returns empty in Chromium (pseudo-**class** styles are not exposed that way, unlike
pseudo-elements), so focus visibility is **not** evidenced by that number. It is
evidenced instead by `apps/web/e2e/shell-a11y.spec.ts`
`"keyboard-only can reach every primary nav destination with visible focus"` — a
real-browser assertion that also runs as the heavy lane's `accessibility` job —
and by the focus-order/focus-management assertions in `booking-a11y.test.tsx` and
`calendar-a11y.test.tsx`. Nothing was redesigned during this review.

## Success-criteria evidence

| SC | Result | Evidence |
|---|---|---|
| **SC-001** — two truly concurrent conflicting Booking creates: exactly one commits, one explicit conflict, real PG + real concurrent connections | **Automated — PASS** | `apps/api/src/modules/booking/__tests__/overlap-concurrency.int.test.ts`: `"blocks the second overlapping create inside PostgreSQL and fails it on bookings_no_overlap"`, `"lets exactly one of two simultaneously-issued overlapping creates commit"`, plus the reschedule equivalents and `"lets exactly one of two genuinely concurrent same-version edits win"`. Independent `pg.Client` sessions driven to an explicit barrier, with `pg_stat_activity` polled from a **third** connection until PostgreSQL reports the second backend waiting on a Lock; the unordered companion accepts `23P01` or a `40P01` deadlock-victim outcome. Arbitration is the database `EXCLUDE USING gist` constraint (`0010_booking_overlap_exclusion.sql`), not check-then-insert. HTTP surfacing: `booking-api.int.test.ts` `"rejects an overlapping booking with 409 booking-overlap and no constraint detail"`. Part of the 62/62 PASS above. |
| **SC-002** — half-open `[start,end)`: adjacency is not overlap, any non-zero overlap rejected | **Automated — PASS** | Property level: `scheduling/__tests__/interval-algebra.property.test.ts` `"half-open adjacency — properties"` → `"treats a.end === b.start as non-overlapping for every generated boundary"`. Domain level: `booking/__tests__/booking.test.ts` `"is half-open: a booking starting exactly where another ends does not overlap it"`. Database level: `overlap-concurrency.int.test.ts` `"allows half-open adjacency: one range's upper bound equals the next one's lower bound"` and `booking/__tests__/schema.int.test.ts` `"stores a half-open [lower, upper) range, whatever the session time zone"`. Adjacency is decided by PostgreSQL's own `'[)'` range semantics — no epsilon anywhere. |
| **SC-003** — buffer-inclusive blocking intervals participate in overlap detection | **Automated — PASS** | `overlap-concurrency.int.test.ts` `"rejects an overlap caused only by buffers"` — a booking whose buffers, not its service time, collide is refused by `bookings_no_overlap`. The constraint keys on `0009`'s STORED GENERATED `blocking_range` = `[starts_at − pre, starts_at + duration + post)`, so a buffer overlap and a service overlap are literally the same case. Snapshot immutability (so a later Service edit cannot retroactively move a held window) is proven by `schema.int.test.ts` `"keeps the persisted duration/buffers independent of a later Service edit"` and `"does not re-snapshot on reschedule: only the range moves"`. |
| **SC-004** — DST forward-gap and repeated-hour recurrence expansion deterministic, no phantom/duplicate intervals | **Automated — PASS** | `scheduling/__tests__/recurrence-dst.test.ts` — 14 cases across two zones (`Europe/Berlin`, `Europe/London`). Forward gap: shortens a straddling span to real elapsed time, produces nothing for a rule entirely inside the gap, clamps a start forward / an end back to the transition instant, unaffected on surrounding ordinary Sundays. Repeated hour: resolves to the **earlier** occurrence (`research.md` R-DST), spans it exactly once, lengthens a straddling span by exactly the repeated hour. Plus the property case `"never produces an overlapping, unsorted, empty or duplicated interval"` across transition weeks. All on `Temporal`, no raw JavaScript `Date` in domain scheduling code (`booking.test.ts` `"keeps Temporal instants and constructs no JavaScript Date"`). Part of the 84/84 PASS above. |
| **SC-005** — **100%** of Phase-2 tenant-owned tables have automated RLS isolation proof | **Automated — PASS** | Per table, real PG: `catalog/__tests__/schema.int.test.ts` (`services`, `service_categories` — RLS enabled+forced+policy, cross-workspace read invisible, insert refused by WITH CHECK, update refused, fails closed with no context, cross-workspace category association rejected by composite FK); `scheduling/__tests__/schema.int.test.ts` (`availability_patterns`, `availability_exceptions` — same set, plus "the app role holds no UPDATE/DELETE grant at all"); `booking/__tests__/schema.int.test.ts` "tenant isolation" (4 cases on `bookings`) and `"grants the app role SELECT/INSERT/UPDATE but never DELETE"`; `platform/idempotency/__tests__/idempotent-execution.int.test.ts` (`idempotent_requests` — RLS enabled+forced+policy, `"keeps the same key independent and isolated across workspaces"`, fails closed). **The quantifier itself** is proven by the new `apps/api/src/test/isolation/tenant-table-census.int.test.ts` (this PR): it discovers tenant ownership from the live PostgreSQL catalog rather than a hand-maintained list, pins the discovered set to the accepted tenant-ownership matrix, and asserts RLS enabled + FORCE + policy on 100% of it — so a future tenant table cannot appear without failing. Combined 74/74 + 2/2 PASS. No policy was weakened; no grant was widened. |
| **SC-006** — Booking state machine rejects 100% of enumerated invalid transitions with `problem+json` | **Automated — PASS** | Domain, table-driven: `booking/__tests__/booking.test.ts` `"state machine matrix (every state × every mutating command)"` plus `"names the command and source state on every rejection"`, `"persists exactly three states — no draft, no pending"`, `"exposes no confirm command (creation lands directly at confirmed)"`, the ratified terminal-retry cases (`"re-cancelling with the CURRENT version is a no-op…"` / `"…with the PRE-transition version is a stale write, not a no-op"`, same for complete) and `"checks the version before the state, so a terminal booking still reports a stale write"` — 47/47 PASS. HTTP `problem+json` mapping: `booking/http/__tests__/booking-api.int.test.ts` proves `409 invalid-transition` for reschedule-of-terminal, cancel-of-completed and complete-of-cancelled, and `409 stale-write` for each stale-version path, against real PostgreSQL. Database backstop: `schema.int.test.ts` `"a terminal booking cannot be mutated again even with a matching version"`, `"a stale expectedVersion matches no row and overwrites nothing"`, `"persists exactly three status values"`. |
| **SC-007** — OpenAPI / `@slotnova/contracts` deterministic across repeated generation | **Automated — PASS** | Two consecutive `pnpm contracts:generate` runs produced byte-identical artifacts (MD5s and an empty `git status` after each — see "Local validation results"). `pnpm contracts:check` (regenerate + `git diff --exit-code`) PASS; `pnpm contracts:check:breaking` PASS. All 12 Phase-2 operations are present (`/v1/catalog/services`, `/v1/catalog/services/{id}`, `/v1/catalog/categories`, `/v1/scheduling/availability-patterns`, `/v1/scheduling/availability-exceptions`, `/v1/scheduling/availability/resolve`, `/v1/bookings`, `/v1/bookings/{id}`, `/v1/bookings/{id}/{reschedule,cancel,complete}`, `/v1/calendar`). PR #80's nullable-scalar correction is **stable**: all six affected properties re-verified as `{"type":"string","nullable":true}` rather than `array of string`. |
| **SC-008** — Booking create and Calendar render correctly at desktop and ≤400px mobile | **Automated — PASS** | Real browser (this PR): `apps/web/e2e/journey-10-reschedule-mobile.spec.ts` `"Booking and Calendar are operable at a 390px mobile viewport"` — the stacked agenda renders (`[data-layout="mobile"]` present, `[data-layout="desktop"]` absent), open + occupied entries are both visible and labelled in words, there is no horizontal page scroll, navigation into Booking detail works, and the last primary action is laid out clear of the fixed bottom nav **measured from real bounding boxes**. Desktop is the default viewport for journeys 06–09 and the reschedule journey. jsdom complements: `calendar-states.test.tsx` `"renders the desktop timeline above the mobile breakpoint"` / `"renders a deliberately different mobile agenda at ≤ 400px, not a compressed timeline"`; `booking-a11y.test.tsx` `"substitutes a stacked mobile layout at ≤400px rather than compressing the desktop grid"`, `"never positions a booking action with fixed/sticky placement over the mobile nav"`, `"renders the same semantics and action set at mobile width"`. The 390px journey also re-asserts the hard mobile-IA invariant: the primary bar is exactly Home · Calendar · Clients · Recovery · More, and Booking stays under "More". |
| **SC-009** — changed interactive flows pass keyboard-only operation and axe with zero critical violations | **Automated — PASS** | Booking: `booking-a11y.test.tsx` — axe-clean on the service step, on time + review including a field error, on detail and on the destructive confirmation, and (added in this PR) **on the reschedule panel**; keyboard-only completion of the whole create flow, keyboard-only operation of the destructive cancel confirmation, and (added in this PR) keyboard-only operation of reschedule with Back-before-Save ordering, no trap, and `aria-invalid` / `aria-describedby` error association with focus moved to the field. 12/12 PASS. Calendar: `calendar-a11y.test.tsx` — zero critical axe violations with mixed content, in the mobile agenda, and in the empty / error / permission-restricted states; single `h1` and real landmarks with **no fake ARIA grid**; every entry has a meaningful accessible name; date navigation reachable and activatable by keyboard alone; tabbing from the pager into the day's entries without a trap; Enter opens an occupied booking; an unbookable open slot is kept out of the tab order. Shell-level real-browser axe: `apps/web/e2e/shell-a11y.spec.ts` (also the heavy lane's `accessibility` job). Reduced motion remains enforced repo-wide by `apps/web/src/styles/reduced-motion.css` and by `booking-a11y.test.tsx` `"uses only semantic tokens for colour, and declares no motion of its own"` + `pnpm lint:styles` (0 violations). The axe helper asserts zero violations of **any** severity, which is stricter than the criterion's "zero critical". |
| **SC-010** — no Recovery / Payments / Notifications / Messaging / Staff product UI / Clients-customer persistence / Inventory / Marketing / Analytics introduced | **Automated + Manual — PASS** | See "Scope consistency" below. Machine-checked part: `tenant-table-census.int.test.ts` `"introduced no client/customer, staff, resource or location dimension on a Phase-2 table"` queries `pg_attribute` directly and asserts no `client_id` / `customer_id` / `staff_id` / `resource_id` / `location_id` column exists on any of the six Phase-2 tables. |
| **SC-011** — bounded PR sequence, no PR exceeding the established heavy-lane CI budget | **Manual + CI evidence — PASS** | Thirteen bounded PRs (table in "Context"), each scoped to one `tasks.md` slice and one issue, with the two riskiest invariants deliberately split across separate PRs (PR-05 state machine / PR-06 concurrency) and two corrective slices raised as their own PRs rather than amended into a merged one. No "build all" PR; no single PR combines schema + API + UI for more than one module. Budget: the founder-approved 180s ceiling is unchanged in `docs/standards/ci-quality-gates.md` and enforced live by `heavy.yml`'s `budget-check` job (`tooling/perf/check-heavy-budget.ts`), which runs after every other heavy-lane job on every PR. Exact-head figure recorded in "CI evidence" below. |

## Scope consistency

Reviewed the whole Phase-2 diff (`2d556de` … `cd95b82`, 190 files) rather than
a single PR. Every directory added under `apps/api/src/modules` and
`apps/web/src/features` across Phase 2:

`booking/` (domain, application, infrastructure, http), `catalog/` (same),
`scheduling/` (same), `calendar-read/` (application + http only — **no domain,
no infrastructure, no table**), `platform/idempotency/`, one identity file
(`domain/policy/request-workspace-context.ts`), and on the web side
`features/booking/` and `features/calendar/`.

**Nothing else.** Specifically confirmed absent:

- **Clients / customer persistence** — no table, no column, no module, no picker.
  Asserted at the database level by the census test; asserted in the UI by
  `journey-08-booking.spec.ts` (`main` landmark contains no `/client|customer/i`
  text) and by `ReviewStep.tsx`'s own contract. "Clients" survives only as a
  Phase-1 placeholder nav destination, which is a hard mobile-IA invariant.
- **Recovery, Payments, Notifications, Messaging, Staff product UI, Inventory,
  Marketing, Analytics** — a grep of all Phase-2 non-test source for these terms
  returns **only disclaiming comments** (e.g. `create-booking.use-case.ts`
  "implements no Recovery/Notifications consumer (FR-027, ADR-024)",
  `money.ts` "…Payments", `booking.schema.ts` "…nothing of the sort happened").
  No module, route, table, event or UI surface.
- **Excluded Booking/Scheduling dimensions** — no `resource_id`, `location_id`,
  `staff_id` or `client_id` on any Phase-2 table, matching the Founder decisions
  on a single implicit workspace-level resource, deferred location and Phase-3
  Clients. `bookings_no_overlap` is keyed on `workspace_id` alone.
- **No draft/pending persisted state** — the `booking_status` enum is exactly
  `confirmed` / `completed` / `cancelled` (`schema.int.test.ts` "persists exactly
  three status values — no draft, no pending"), there is no `/confirm` route, and
  Draft/Review exist only as component state in the create flow.
- **No outbox/audit emission** — Phase 2 has no consumer (`research.md`, FR-027),
  and none was speculatively added.
- **No Tailwind, no barrel-layer, no `common/shared/core/utils` package, no
  `BaseService`** — `pnpm lint:boundaries` PASS, 0 violations over 509 modules.
- **No Phase-3 work started.**

### The one defect exit validation found

Running the repository's own documented verification path **in order** — build
Storybook (what `heavy.yml`'s `visual-regression` job does) and then
`pnpm verify:fast` in the same checkout — failed, with ESLint reporting 16 861
errors and Stylelint 359, every one of them from vendored bundles inside
`packages/ui/storybook-static/`. `storybook-static/` is a build output and is
gitignored beside `dist`, but ESLint and Stylelint each carry their own ignore
list and neither excluded it. Prettier, which honours `.gitignore`, was already
correct.

- **Severity: low.** It is a tooling-hygiene defect, not a product-behaviour one.
  CI never hit it because `visual-regression` and `fast` run in separate jobs on
  separate checkouts, so no gate was silently passing when it should have failed
  and no evidence recorded anywhere is invalidated.
- **Fix: two lines**, each a `"**/storybook-static/**"` entry placed beside the
  existing `"**/dist/**"` entry in `packages/eslint-config/src/base.js` and
  `stylelint.config.cjs`. No rule was relaxed, no file was exempted from a check
  it should face, and no product code was touched.
- **Verified**: `pnpm verify:fast` **9/9 PASS** (36.4s) with
  `packages/ui/storybook-static/` present in the working tree — i.e. the fix was
  confirmed against the reproducing condition, not by deleting the artifact.

Apart from this, PR-10 adds **no product code**: three test files
(`apps/web/e2e/journey-10-reschedule-mobile.spec.ts`,
`apps/api/src/test/isolation/tenant-table-census.int.test.ts`, and two cases in
`apps/web/src/features/booking/__tests__/booking-a11y.test.tsx`) plus this
document and the `tasks.md` / `.slotnova/CURRENT.md` records. **No defect
requiring a product-code or schema change was found during exit validation**, so
none was made; no migration `0011` exists.

## Founder decisions applied

Recorded here as the Phase-2 decision register. Each is authoritative and was
resolved by the Founder, not inferred:

1. **Draft / Review are client-only.** No Booking row exists until final creation,
   and no capacity is held before then. `Draft` is UI flow state; `Review` is a
   check-answers step.
2. **Operator-created Bookings are created directly `confirmed`.** Phase 2 ships no
   `Pending`-producing flow and no `/confirm` route; `Pending` is a documented
   future lifecycle extension point, not a reachable enum value.
3. **One implicit workspace-level bookable resource.** No staff profile rows, no
   synthetic staff identities, no staff CRUD, no multi-staff scheduling.
4. **No location in Phase 2.** No speculative nullable `location_id`; the exclusion
   constraint does not depend on location.
5. **No client entity in Phase 2.** No customer identity exists on `main`, and
   operator/staff records are not reinterpreted as one. Phase 3 adds the
   Booking↔Client association additively.
6. **Retroactive availability edits do not invalidate existing bookings.**
   Availability governs what can be offered, not what has already been committed.
7. **Add-ons deferred**; **ServiceCategory is optional and simple**.
8. **`effectiveUntil` is EXCLUSIVE** — bounds are `[effectiveFrom, effectiveUntil)`,
   so `effective_until = 2026-10-01` yields no availability on that date.
9. **Scheduling horizon `MAX_EXPANSION_HORIZON_DAYS = 370`** is an operational
   safety cap, **not** a product promise of one year of booking visibility, and
   must not be silently widened.
10. **Non-overlapping effective pattern history.** Effective-dated history is
    allowed; two pattern windows must not overlap; adjacency is valid; there is
    **no** newest-wins / last-created-wins / id-based precedence rule. Promoted to
    a PostgreSQL `EXCLUDE` constraint in `0010`, with the application check kept
    only for friendly 422 translation.
11. **Ratified terminal-state retry semantics.** A same-command no-op retry on an
    already `cancelled` / `completed` booking succeeds **only** when the caller's
    version matches the CURRENT row version; anything else is a 409 stale write.
    The version check runs before the state check.
12. **Reschedule of a source status that does not permit it = `409 invalid-transition`**
    (not 422), matching the conflict-type table; reconciled in
    `contracts/booking.contract.md` by PR-07A.
13. **Booking list window = `blocking_range` overlap.** `GET /v1/bookings?from=&to=`
    filters `blocking_range && tstzrange(from, to, '[)')` — the booking's OCCUPIED
    interval must overlap the window — reusing the same generated range the
    exclusion constraint arbitrates on, so "visible in this window" and "occupies
    this window" cannot drift apart.
14. **Calendar composition failure = canonical `internal` 500**, never partial data.
    Recorded deviation: `calendar.contract.md` words this as "502/503-mapped", which
    was written when the two halves were imagined as out-of-process calls; in the
    shipped modular monolith both are in-process application ports, so the existing
    `internal` slug is accurate and **no `bad-gateway` slug was invented**. The
    required behaviour (canonical `problem+json`, no partial data, explicit frontend
    error+retry state) is unchanged.
15. **Calendar caller-visible maximum window = 368 days**, because the requested
    window is widened ±1 day before Scheduling's own 370-day guard is applied
    (UTC offsets reach ±14h). 369+ days is a `422`, never a silent clamp.

### Deferred, and explicitly NOT resolved in PR-10

16. **Default role→capability mapping for `catalog:*` / `scheduling:*` / `booking:*`
    remains an OPEN Founder product decision.** PR-02, PR-04, PR-07 and PR-09 each
    deliberately left `identity`'s `DEFAULT_ROLE_PERMISSIONS` untouched, and the
    full Phase-2 diff confirms it was never modified. **Assessed as NOT an exit
    blocker**: the shipped architecture already enforces capabilities
    server-authoritatively through `CapabilityGuard`, memberships carry explicit
    `permissions`, every test and E2E fixture grants capabilities explicitly, and
    no accepted artifact (`spec.md`, `plan.md`, `data-model.md`, any contract)
    specifies a default mapping — so inventing one would be unauthorized product
    policy, not exit work. Until the Founder decides it, Phase-2 capabilities are
    granted by writing them onto a membership's `permissions`. Recorded as a
    deferred product-policy decision.

## Known limitations / deferred work

- **Clients / customer domain is Phase 3.** Booking is valid without it in Phase 2;
  the association arrives as an additive migration plus an application-port
  integration.
- **Richer staff / resource model is future work.** Phase 2's protected-resource key
  is `workspace_id` alone. Adding a resource dimension later means widening the
  exclusion constraint's key, which is an additive migration.
- **Multi-location is future work**, for the same reason.
- **Default role→capability mapping is deferred** (item 16 above).
- **Figma visual limitation persists and is unresolved.** `06 — Calendar`,
  `07 — Booking`, `18 — Prototypes` and `19 — Implementation Handoff` were not
  reachable in any Phase-2 session — the Figma MCP server is unauthenticated in
  this environment, which PR-08, PR-09 and the original planning pass each
  recorded independently. Per the AGENTS.md/CLAUDE.md caveat this is a
  **visual-access limitation, not evidence that the design is absent**:
  `docs/product-handoff.md` and the committed contracts were used as authority,
  and Calendar's single-day range mode is documented as a bounded decision rather
  than inferred from absent visuals. Phase 3 should re-verify the Booking and
  Calendar surfaces against approved Figma once access is available.
- **Visual-regression baselines are Linux-only.** Local macOS runs cannot compare
  against them; CI is authoritative (Phase-1 precedent, unchanged).
- **Phase-2 emits no outbox/audit events**, by decision, because no consumer exists.
  Any Phase-3 consumer must add emission deliberately.
- **No performance/load budget exists for the Phase-2 API paths.** Phase 1 recorded
  install/build/test and route-bundle baselines only; `docs/standards/ci-quality-gates.md`
  already anticipates later phases adding API latency budgets. Not a Phase-2 exit
  criterion, flagged for Phase 3.

## CI evidence

PR [#84](https://github.com/Nejo12/slotnova/pull/84). The runs below are the
exact-head runs for `1f209ed89d6b1dd59b1f976fd9b9696e41e7ad63`, which is the
head carrying **every** code and test change in this PR. The only later commit
on the branch is the one that writes this very section into this file — a
documentation-only change with no effect on any gate — and it re-triggers the
same four workflows on the final head. The Founder should confirm that final
set is green before merging.

| Workflow | Run | Result | Wall clock |
|---|---|---|---|
| `fast` | [`35346271279`](https://github.com/Nejo12/slotnova/actions/runs/35346271279) | **success** | 12:44:26Z–12:46:04Z = **98s** |
| `security` | [`35346271257`](https://github.com/Nejo12/slotnova/actions/runs/35346271257) | **success** | 12:44:26Z–12:45:11Z = **45s** |
| `heavy` (authoritative) | [`35346379557`](https://github.com/Nejo12/slotnova/actions/runs/35346379557) | **success — every job** | 12:45:34Z–12:47:39Z = **125s** |
| `heavy` (superseded first attempt) | [`35346271312`](https://github.com/Nejo12/slotnova/actions/runs/35346271312) | failure — `migration-checklist` only | 12:44:26Z–12:46:39Z = 133s |
| `e2e` | [`35346271303`](https://github.com/Nejo12/slotnova/actions/runs/35346271303) | **success** | 12:44:26Z–12:48:59Z = **273s** |

### Heavy-lane budget

**125 seconds against the founder-approved 180-second budget — within budget,
with 55s of headroom.** The `heavy-lane time budget check (180s, T089)` job
(`tooling/perf/check-heavy-budget.ts`) itself completed **`success`**
(12:47:13Z–12:47:39Z). The budget was **not** weakened, raised or bypassed, and
the heavy lane's job set is unchanged by this PR. For reference, Phase 1's
recorded baseline was 93s; the +32s reflects Phase 2's substantially larger
real-PostgreSQL and Playwright surface, not a regression in any single job — the
slowest job, `axe accessibility checks`, is 94s of the 125s.

### Heavy-lane job breakdown (run `35346379557`, inspected per job rather than by badge)

| Job | Result | Duration |
|---|---|---|
| `migration-checklist` | **success** | 19s |
| `migration-proof` | **success** | 53s |
| `targeted visual regression (Storybook, Light/Dark)` | **success** | 60s |
| `axe accessibility checks (Playwright journeys)` | **success** | 94s |
| `security scans (see security.yml)` | **success** | 2s |
| `release-migrations` | skipped (not a release event) | — |
| `heavy-lane time budget check (180s, T089)` | **success** | 26s |

The superseded first heavy attempt (`35346271312`) had every one of those jobs
green **except** `migration-checklist`, and that failure was **not a code
defect**: the PR body initially omitted the repository's required
migration-review checklist block (`tooling/migrations/check-pr-checklist.ts`
requires every reviewer item plus exactly one `Schema change: yes/no` selection
on **every** PR, including no-schema ones). The body was corrected —
`Schema change: no`, with an explicit statement that `packages/db/migrations/` is
untouched, `0001`–`0010` are consumed as merged, there is no `0011`, and the RLS
impact is zero — and the whole heavy lane then passed. Recorded here rather than
quietly re-run.

The two authoritative pixel/accessibility gates — `visual-regression` and
`accessibility`, both on `ubuntu-latest` — passed on this exact head, which is
the CI evidence the "Local validation results" section defers to for visual
regression.

**All four required workflows are green on `1f209ed`**: `fast` ✅, `e2e` ✅,
`heavy` ✅, `security` ✅ — each inspected at job level, not by aggregate badge.
The `e2e` lane (`pnpm test:integration` + `pnpm e2e`) is the one that executes
the two new Playwright journeys and the new `tenant-table-census.int.test.ts`
against real PostgreSQL in a clean room, and it passed there as it did locally
(`verify:integration` 2/2, `pnpm e2e` 13/13).

The only branch commits after `1f209ed` are the documentation-only ones that
write this very section. They re-trigger the same four workflows on the final
head; since they change no code, test, config or generated artifact, the result
above is the substantive CI evidence for this PR. The Founder should still
confirm the final head's runs are green before merging.

## Final exit assessment

**READY TO EXIT**, subject to the Founder's manual review and merge of the PR-10
pull request and to the exact-head CI evidence recorded in the section above.

Reasons:

1. All eleven success criteria SC-001 … SC-011 are satisfied by evidence that was
   run, not asserted — 9/9 fast-lane checks, 2/2 integration-lane checks, 13/13
   Playwright journeys, and every targeted suite cited above passing on this head.
2. The invariant-bearing criteria (SC-001 concurrency, SC-002/003 interval and
   buffer semantics, SC-005 RLS) are proven at the strongest available boundary —
   real PostgreSQL with genuinely concurrent independent connections, and database
   constraints rather than application checks — with no mock and no sequential
   substitute anywhere.
3. Exit validation found **no defect in accepted Phase-2 behaviour**. The one
   defect it did find is a low-severity tooling-hygiene gap (two missing
   lint-ignore entries for Storybook's build output), fixed without relaxing any
   rule. Everything else that was missing was *evidence*, not behaviour, and all three were closed with bounded tests and zero
   product-code change: an integrated reschedule journey, a real-browser ≤400px
   path, a discovery-based RLS quantifier proof, and accessibility coverage of the
   reschedule panel.
4. No excluded or Phase-3 behaviour was introduced anywhere in Phase 2, verified
   against the full 190-file diff and machine-checked at the schema level.
5. The one open Founder decision (default role→capability mapping) is genuinely
   orthogonal to every exit criterion and is recorded as deferred rather than
   silently resolved.

Parent issue #3 remains open and is **not** closed by this PR.
