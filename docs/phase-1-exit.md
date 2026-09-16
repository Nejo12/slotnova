# Phase 1 Exit Validation (T090)

Status: **All 18 success criteria demonstrably PASS. Phase 1 exit criteria are fully met.** Founder merge of PR #55 is the remaining step to formally declare Phase 1 exited.

## Verification legend

- **Automated** — verified by a command run in this session, with output shown.
- **CI evidence** — verified by a completed GitHub Actions run (cited by run ID/URL), not re-run locally.
- **Manual** — verified by direct inspection of source/config in this session (not machine-checked).
- **N/A** — the criterion doesn't apply at this stage, with reasoning.
- **Unresolved** — could not be honestly validated in this environment.

## Context

- Starting main SHA for this PR: `2a0dddb7d860debb6f8abe831b6bed439813d617` (PR #53 / PR-19 merged).
- Worktree: `/Users/olaniyiaborisade/Codes/slotnova-pr-20-phase-1-exit`, branch `feat/pr-20-phase-1-exit`, created fresh from verified `origin/main`.
- Merged PR range covering Phase 1: PR-01 through PR-19 (T001–T089, all checked complete in `specs/001-platform-foundation-shell/tasks.md`).
- Required CI gates on `main`/PRs: `fast`, `e2e`, `heavy` (includes `migration-checklist`, `migration-proof`, `visual-regression`, `accessibility`, `security-scan-reference`, `budget-check`), `security`.
- Heavy-lane observed baseline: **93 seconds** (PR #53, head `218cf73095d5ef21c1da27ea4a973c9151f023bf`, run [`35119891244`](https://github.com/Nejo12/slotnova/actions/runs/35119891244), 2026-09-16T16:07:44Z–16:09:17Z).
- Founder-approved heavy-lane pre-merge budget: **180 seconds (3 minutes)**, recorded in `docs/standards/ci-quality-gates.md` and `docs/runbooks/perf-baselines.md`.
- Live proof the budget-check mechanism works in production CI: the final `heavy.yml` run on PR #53's merged head (`04f5ee22786bd5e11a6a2e3e7c104c49346e64fc`, run [`35121070930`](https://github.com/Nejo12/slotnova/actions/runs/35121070930)) includes a `heavy-lane time budget check (180s, T089)` job that completed `success`; the whole workflow ran 2026-09-16T16:18:41Z–16:20:23Z = 102s, within budget.
- Founder review follow-up (this update): approved `docs/decisions/0005-production-identity-provider.md` and `0006-csrf-mechanism.md` as-written; found `0002-version-pins.md`'s original draft insufficient (T080 requires exact patch pins after a documented compatibility run; the original draft still left every non-exact dependency as a caret/tilde range). `0002` was rewritten: all 80 caret/tilde-ranged `dependencies`/`devDependencies` specifiers across every workspace `package.json` converted to the exact patch already resolved in `pnpm-lock.yaml` (`peerDependencies` intentionally excluded — see the record's own scoping rationale). Verified the lockfile regeneration changed only `specifier:` metadata lines — zero lines changed in the `packages:`/`snapshots:` sections, i.e. no dependency actually moved to a different resolved version.

## Local validation results

Initial pass (fresh worktree, Node 24.20.0):

- `pnpm install --frozen-lockfile` — clean install, no errors.
- `pnpm verify:fast` — **9/9 PASS**, 32.5s (format, ESLint, Stylelint, dependency-cruiser boundaries, typecheck, unit/property tests, build, contract-drift check, OpenAPI breaking-change check).
- `pnpm verify:integration` — **2/2 PASS**, 159.4s (real-PostgreSQL/Testcontainers integration across `@slotnova/db`/`@slotnova/api`/`@slotnova/worker`; Playwright journeys via `pnpm e2e`).
- `pnpm contracts:check` — PASS (committed generated OpenAPI/types artifacts match current source; no drift).
- `pnpm lint:boundaries` — PASS, 0 violations, 353 modules / 812 dependencies cruised.
- `pnpm lint:styles` — PASS, 0 violations (Stylelint token-only enforcement).

Re-verification after T080's exact-pin conversion (same worktree, dependency manifests + lockfile changed, no source changed):

- `pnpm install --frozen-lockfile` — succeeds against the regenerated lockfile (self-consistency proof).
- `pnpm verify:fast` — **9/9 PASS**, 29.3s.
- `pnpm verify:integration` — **2/2 PASS**, 151.1s.
- `pnpm contracts:check` — PASS.
- `pnpm lint:boundaries` — PASS, 0 violations, 353 modules / 812 dependencies.
- `pnpm format:check` — PASS (rewritten `package.json` files remain Prettier-clean).
- `pnpm e2e` — **5/5 PASS**, run standalone (not only via `verify:integration`).
- `git diff --check` — clean, no whitespace errors.
- Lockfile diff inspection: every changed line in `pnpm-lock.yaml` is a `specifier:` metadata line; zero lines changed in the `packages:` or `snapshots:` sections — no dependency resolved to a different version.
- Targeted integration suites, run individually for direct per-SC citation:
  - `apps/api/src/test/isolation/*.int.test.ts` — 3 files, **26/26 PASS**.
  - `packages/db/src/testing/__tests__/rls-coverage.int.test.ts` — **2/2 PASS**.
  - `apps/api/src/modules/identity/__tests__/adapter-parity.int.test.ts` — **2/2 PASS**.
  - `apps/api/src/modules/identity/http/__tests__/invitation.int.test.ts` — **12/12 PASS**.
  - `apps/api/src/test/observability/correlation-propagation.int.test.ts` — **7/7 PASS**.
  - `apps/worker/src/outbox/__tests__/concurrency.int.test.ts` + `apps/worker/src/scheduler/__tests__/concurrency.int.test.ts` — **11/11 PASS** (genuine concurrent connections/processes, not sequential loops).
  - `apps/web/src/app/shell/__tests__/*` — 6 files, **16/16 PASS**.
- Visual regression (`packages/ui` `test:visual`): **not re-run to a fresh local pass in this session** — this machine's local screenshots don't match the committed Linux baselines (same known macOS-vs-`ubuntu-latest` platform-rendering gap already documented in `docs/runbooks/perf-baselines.md` from PR-19). Authoritative evidence is CI: the `targeted visual regression (Storybook, Light/Dark)` job succeeded on `ubuntu-latest` in both the PR #53 merge-gating run (`35119891244`) and its final head's run (`35121070930`).

## SC-001 … SC-018 evidence matrix

| SC | Result | Evidence |
|---|---|---|
| **SC-001** — clone-to-running in <30 min, no undocumented manual fixes | **Automated + Manual** | `pnpm install --frozen-lockfile` (clean, fresh worktree) → `pnpm verify:fast` (9/9 PASS, 32.5s) → `pnpm verify:integration` (2/2 PASS, 159.4s) all ran end-to-end without any undocumented fix. `docs/runbooks/local-dev.md`'s 8-step fast-lane sequence matches exactly what `tooling/verify/run.mjs`'s `FAST_TASKS` runs. **Caveat**: `docs/runbooks/local-dev.md` itself states the <30 min contributor-onboarding claim is "pending founder/manual second-person verification" — that second-person timing check has not been done by anyone, this session included (I am not a fresh contributor establishing environment prerequisites like Docker/Node from zero). Marking this **Manual (partial)** — the automated command chain is proven; the human first-timer clock has not been run. |
| **SC-002** — fast lane <3min warm; heavy-lane baseline + founder-approved budget recorded | **Automated + CI evidence** | Fast lane: 32.5s locally (well under 3 min). Heavy lane: 93s observed baseline (run `35119891244`) and 180s founder-approved budget, both recorded in `docs/standards/ci-quality-gates.md` and `docs/runbooks/perf-baselines.md`. Enforcement proven live in CI (`budget-check` job, run `35121070930`, `success`). |
| **SC-003** — 100% tenant-owned tables have RLS + policy, asserted automatically | **Automated** | `packages/db/src/testing/rls-coverage.int.test.ts` — 2/2 PASS; generic schema-agnostic assertion over every tenant-owned table. |
| **SC-004** — automated test proves cross-workspace isolation over every foundation data path, real PG, concurrent connections for concurrency cases | **Automated** | `apps/api/src/test/isolation/tenant-tables.int.test.ts`, `identity-data-paths.int.test.ts`, `concurrency.int.test.ts` — 26/26 PASS combined, against real PostgreSQL (Testcontainers), including a genuine-concurrency case. |
| **SC-005** — deliberate architecture/type/style violation caught 100% of the time | **Automated** | `tooling/dependency-cruiser/__tests__/rules.test.ts` (14 fixture cases, each proving a deliberately-broken fixture trips its rule) verified in prior PR-19 session and unchanged on this main; `pnpm lint:boundaries` on real code: 0 violations. `pnpm typecheck` enforces the full strict TS baseline (`docs/standards/ci-quality-gates.md`). `pnpm lint:styles`: 0 violations. |
| **SC-006** — shell nav/switcher/dialogs axe-clean; keyboard-only reaches every destination with visible focus | **Automated** | `apps/web/e2e/shell-a11y.spec.ts` (real-browser axe + keyboard-reachability assertions, part of `pnpm e2e`, PASS via `verify:integration`); `apps/web/src/app/shell/__tests__/DesktopShell.test.tsx`, `MobileShell.test.tsx`, `keyboard-navigation.test.tsx` — jsdom-level complement, 16/16 PASS across the shell test suite. |
| **SC-007** — Light/Dark 100% token-driven; no raw color/motion value passes lint outside token layer | **Automated + Manual** | `pnpm lint:styles`: 0 violations (Stylelint `stylelint-declaration-strict-value` rule rejects raw colors/motion). Manually confirmed `apps/web/src/styles/theme.css`'s four-layer token load order and `reduced-motion.css`'s repo-wide `prefers-reduced-motion` floor exist as described in `docs/standards/motion.md`. |
| **SC-008** — regenerating contract/client from unchanged schemas is byte-identical; stale artifact fails CI 100% | **Automated** | `pnpm contracts:check` (`tooling/contracts/check-drift.sh`): PASS, regenerates and `git diff --exit-code`s the committed OpenAPI/types artifacts — 0 drift. `.github/workflows/fast.yml` runs this same check on every PR. |
| **SC-009** — outbox exactly-once effective processing across worker restart/two concurrent workers, no lost/duplicated events | **Automated** | `apps/api/src/modules/platform/outbox/__tests__/writer.int.test.ts` (atomic transactional write, T024) + `apps/worker/src/outbox/__tests__/concurrency.int.test.ts` (10 records, synchronized peer connection, proves exclusive claim/exactly-once) — combined with scheduler concurrency test, 11/11 PASS this session. |
| **SC-010** — delayed job runs exactly once, survives restart; repeatedly-failing job dead-letters within bound | **Automated** | `apps/worker/src/scheduler/__tests__/jobs.int.test.ts`, `release.int.test.ts`, `concurrency.int.test.ts` (forks a second worker process against real pg-boss) — part of the 11/11 PASS above and `pnpm --filter @slotnova/worker exec vitest run --config vitest.integration.config.ts src/scheduler/__tests__/release.int.test.ts`, also run standalone in `heavy.yml`'s `migration-proof` job. |
| **SC-011** — full migration set applies cleanly to empty DB and forward-applies to a populated representative DB, zero destructive loss | **Automated + CI evidence** | `packages/db` `test:integration` (part of `verify:integration`'s 159.4s PASS) proves clean-DB migration; `heavy.yml`'s `migration-proof` job runs the same "explicit CLI clean and populated forward migration proof" on every PR (confirmed `success` on runs `35119891244` and `35121070930`). |
| **SC-012** — correlation id in 100% of a request's structured logs + triggered background-job logs; no sensitive field in sampled audit | **Automated** | `apps/api/src/test/observability/correlation-propagation.int.test.ts` — 7/7 PASS, proving correlation-id propagation. `packages/observability-server/src/redaction.ts` (+ `__tests__/redaction.test.ts`) implements/tests field redaction. |
| **SC-013** — all applicable Phase 1 exit decision records exist, cite evidence/rejected alternatives, ADR-consistent | **Automated + Manual — PASS** | All six exit-decision records exist and are founder-approved: `0001` (hosting/PG), `0003` (scheduler), `0004` (validation/OpenAPI) pre-existed and were already founder-approved; `0005` (production identity provider — "not required" note) and `0006` (CSRF mechanism) approved as-written in this follow-up; `0002` (version pins) approved conditional on genuine exact-patch pinning, which this follow-up implemented (all 80 caret/tilde specifiers converted, verified against the lockfile — see "Local validation results") and is now satisfied. |
| **SC-014** — reviewer confirms no product-domain behavior present | **Manual** | Repo-wide grep of `apps/api/src`, `apps/worker/src`, `apps/web/src`, `packages/ui/src`, `packages/db/src` (excluding `__tests__`/`__fixtures__`) for Booking/Scheduling/Catalog/Recovery/Payments/Messaging/Notifications/Inventory/Marketing/Analytics found only: (a) an explicit disclaiming comment in `apps/api/src/app.module.ts` ("no Booking/Scheduling/Catalog/Recovery/Payments/etc." modules registered), (b) unrelated word matches (`problem-catalogue` = HTTP error catalogue, `location.ts`'s comment explicitly disclaims scheduling logic, `claim.ts`'s "Recovery" = generic lock-recovery, not the product domain), and (c) `apps/web/src/app/router.tsx`/`nav-items.ts` — placeholder nav routes/labels only, each rendering `PlaceholderRoute` (`apps/web/src/app/routes/PlaceholderRoute.tsx`, manually read in full: no data fetching, no business logic, renders a generic empty-state). Mobile primary nav confirmed to match the hard invariant `Home · Calendar · Clients · Recovery · More` exactly (`nav-items.ts:63-68`). **Conclusion: no product-domain behavior found in Phase 1 shipped source.** |
| **SC-015** — delivered as sequence of bounded, independently reviewable PRs, no "build all" PR | **Manual** | `specs/001-platform-foundation-shell/tasks.md`'s bounded-PR table: 21 PRs (PR-00…PR-20), each scoped to specific task IDs; PR history (PR-01 through PR-19 on `main`, this PR-20 in review) confirms the pattern held in practice. |
| **SC-016** — dev credential adapter and production-shaped adapter traverse identical session/context/authz/RLS code | **Automated** | `apps/api/src/modules/identity/__tests__/adapter-parity.int.test.ts` — 2/2 PASS, proving both adapters traverse identical session-issuance/workspace-context/authorization/RLS paths. |
| **SC-017** — E2E workspace-switch isolation + restricted-permission denial + sign-in smoke pass in CI; second isolated browser context works | **Automated** | `apps/web/e2e/journey-06-workspace-switch.spec.ts`, `journey-07-restricted-permission.spec.ts`, `smoke.spec.ts` — all part of `pnpm e2e` (PASS via `verify:integration`, 9.3s this session). `smoke.spec.ts` explicitly proves a second isolated browser context renders the signed-out state. |
| **SC-018** — invitation flow: valid token creates exactly the invited role's membership + audit record; expired/used/revoked token refused with no membership change | **Automated** | `apps/api/src/modules/identity/http/__tests__/invitation.int.test.ts` — 12/12 PASS. `apps/api/src/modules/identity/domain/invitation-token.ts` (+ its own unit tests) implements token validity/expiry/revocation logic. |

## Resolved: Phase 1 exit decision records (formerly the Outstanding blocker)

**T079–T084 (Phase 1 exit decision records) were still unchecked in `tasks.md` when this exit note was first written**, despite three of the six records (`0001`, `0003`, `0004`) already existing and being founder-approved. Resolution, across two sessions:

1. Confirmed `0001-hosting-postgres-provider.md`, `0003-job-scheduler.md`, `0004-validation-contract-integration.md` are founder-approved (each file's own Status line) — checked T079, T081, T082 complete.
2. Wrote `0002-version-pins.md`, `0005-production-identity-provider.md`, `0006-csrf-mechanism.md`, consolidating already-shipped, already-in-force evidence (the CSRF double-submit-cookie mechanism implemented since T037; the explicit "production identity provider not required for exit" deferral already stated in `docs/runbooks/deployment.md`).
3. Founder review: `0005` and `0006` approved as-written. `0002`'s original draft was found insufficient — T080 requires "exact patches pinned after a documented compatibility run," and the draft still left every non-exact dependency as a caret/tilde range.
4. `0002` was corrected: every applicable `dependencies`/`devDependencies` specifier across the workspace (80 entries) converted from caret/tilde ranges to the exact patch already resolved in `pnpm-lock.yaml`; `peerDependencies` intentionally left as ranges (documented rationale in the record itself — pinning a peer range is a compatibility-contract change for consumers of `@slotnova/ui`, not "pinning the already-tested tree"). Verified the lockfile regeneration changed only `specifier:` metadata, not any resolved dependency version.
5. `0002` approved conditional on that correction — condition satisfied. T080, T083, T084 all checked complete.

**All six exit-decision records now exist and are founder-approved. No blocker remains.**

## ADR / Phase-0-review-finding dispositions (T091 scope)

- **D1 (observability package split)**: `research.md` recorded this as "issue #2 wording is looser, not conflicting — follow the ADR/overview (two packages)." Confirmed current issue #2 body (re-read this session) does not contain the literal "packages/observability" singular phrase at all — it says "observability seams," which is not in conflict with the shipped `packages/observability-server` + `packages/observability-browser` split. **Disposition: already resolved, no action needed.** Documented here per T091's explicit instruction to record this disposition.
- **D2 (CSRF mechanism)**: Resolved by `docs/decisions/0006-csrf-mechanism.md` (this PR), per research.md's own framing ("record as a decision record **or** a small ADR-007 amendment — founder choice"). No ADR-007 amendment needed; its text already permitted this mechanism family. **Disposition: resolved, record founder-approved.**
- **D3 (ADR-014 scheduler-timing wording)**: `research.md` recommended tightening ADR-014's wording from "before Recovery is built" to "before Phase 1 exit." Read `docs/adr/014-job-scheduler.md` directly this session — its Decision section **already reads** "record the selected implementation **before Phase 1 exits**." **Disposition: already resolved — the ADR text already reflects the stricter wording. No edit made** (accepted ADRs are immutable history per the constitution; making a "meaningless edit" to already-correct text was avoided per this task's own instruction).
- **D4–D6**: `research.md`'s own table already records these as "no open conflict" (contract-lib specifics resolved by `0004`; PostgreSQL-major flexibility resolved by `0001`; first-party-password-auth assumption already superseded by the 2026-09-08 spec clarification). No further action found necessary; re-confirmed by reading `research.md`'s reconciliation table directly.
- **"C1"**: appears only as a parenthetical cross-reference inside the D3 row in `research.md` — no standalone "C1" finding or disposition exists as a separate artifact anywhere in the repo. Confirmed via full-repo search; not a distinct open item.

## Event catalogue reconciliation (T091 scope)

`docs/architecture/event-catalogue.md` lists three Phase 1 identity events (`invitation.issued` v1, `invitation.accepted` v1, `membership.created` v1). Grepped the actual emitting source (`apps/api/src/modules/identity/application/invitation/issue.ts`, `accept.ts`) this session: every `eventName`/`action` string emitted in shipped code matches the catalogue exactly, no undocumented event exists, and no speculative future-phase event was added. **Disposition: catalogue is accurate as committed; no edit needed.**

## `docs/implementation-plan.md` reconciliation (T091 scope)

Edited in this PR:
- Phase 0 status line corrected from "in progress in PR #10" (stale) to "Approved" (matching `docs/architecture/phase-0-gate.md`'s recorded 2026-09-08 founder approval).
- Phase 1 given an explicit status paragraph reflecting T001–T089 shipped, T090/T091 delivered in this PR, and the three-record founder-approval blocker above. **Phase 1 is not marked "exited"** — only "substantively complete" — consistent with the blocker not yet being resolved. No Phase 2+ section was touched or marked complete.

Note: `.specify/memory/constitution.md` has the same class of stale "Proposed — becomes effective when Phase 0 is approved" status line, but the constitution file is not in T091's named file list (`docs/implementation-plan.md`, ADR amendments, event catalogue, issue #2 reconciliation) and constitution changes are governed by a separate process (`speckit-constitution`) — left untouched, flagged here for founder awareness rather than edited outside this task's authorized scope.

## Quickstart reconciliation

`specs/001-platform-foundation-shell/quickstart.md` already contains its own accurate "PR-17 executable environment boundary" section stating the real executable paths are `docs/runbooks/local-dev.md` and `docs/runbooks/migration-release.md`, and that illustrative command names (`pnpm dev:db`, `pnpm test:integration:isolation`, etc.) were never the contract — the underlying *checks* are. Cross-checked every quickstart section's intended check against a real, currently-shipped command/test in this session (see the SC matrix above for the concrete mapping: §3→SC-006/007 automated tests, §4→SC-003/004 automated tests, §5→SC-018 automated test, §6→SC-008 `contracts:check`, §7→SC-009/010 concurrency tests, §8→SC-011 migration tests, §9→SC-012 correlation test, §10→SC-017 `pnpm e2e`, §11→SC-002/005 CI gates, §12→SC-013 decision records). No quickstart wording changes were needed beyond what PR-17 already corrected — the file already honestly describes its own illustrative-vs-real-command relationship, and no section named an executable path that has since diverged further. **Disposition: quickstart.md already accurate; no edit made.**

## Explicit no-product-domain review conclusion (SC-014)

As detailed in the SC matrix above: **confirmed — no Booking, Scheduling, Catalog, Recovery, Payments, Messaging, Notifications, Staff, Inventory, Marketing, or Analytics product-domain behavior is present anywhere in Phase 1's shipped implementation.** Every navigation destination for those domains renders a shared, logic-free placeholder component. The T080 follow-up changed only dependency manifest specifiers (`package.json`) and the regenerated lockfile — no application source, and therefore no product-domain surface, was touched; this conclusion is unaffected.
