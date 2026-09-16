# PR-19 (T085–T089): Architecture Tightening, Provider-Smoke CI, Heavy Lane, Visual Regression & Performance Baseline

Status: proposed — awaiting founder review before implementation
Issue: Nejo12/slotnova#52 (parent #2)
Branch: `feat/pr-19-hardening-ci-visual-perf`
Verified starting point: `origin/main` @ `33aa0a6c98b7dd20e295daa1bda38a4eddd0cf41` (PR-18/#51 merged)
Worktree: `/Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf` (fresh, created from verified `origin/main`)

## Scope

Implement T085–T089 only, from `specs/001-platform-foundation-shell/tasks.md` (lines 830–863). No product-domain behavior. No T090/T091 work beyond the narrow `.slotnova/CURRENT.md` refresh the issue explicitly asks for.

## Ground truth (verified in this worktree before design)

- `.dependency-cruiser.cjs` header explicitly defers per-module public-entry allowlists, `packages/contracts` generated-only direction, and the `test-harness` production-graph rule to T085 (lines 11–13). Core rules (`no-circular`, `ui-not-to-infra`, `domain-not-to-provider-sdk`, `no-cross-module-internals`, `no-observability-server-in-browser`, `no-deep-import-across-packages`, `not-to-unresolvable`) are already in force and must not be weakened.
- `apps/web/src/test-harness/TestHarness.tsx` is the only file in that directory. It's reachable only via one dynamic `import()` in `apps/web/src/app/router.tsx` (route `/__test-harness`), gated by `VITE_E2E`. A build-output exclusion test already exists (`apps/web/src/__tests__/production-bundle.test.ts`) and asserts no `test-harness` filename/marker string reaches a real `vite build` output. T085 adds a dependency-cruiser rule as defense-in-depth; the build-output test remains the authoritative production-exclusion proof and is not touched.
- `packages/contracts/src` already separates `generated/` (openapi.json, types.ts) from hand-written (`index.ts`, `generate.ts`, `msw/index.ts`). No rule currently enforces that only the package's own public entry points touch `generated/` internals from outside the package, or that `generated/**` doesn't import hand-written internals.
- Backend modules under `apps/api/src/modules/`: `audit/` and `identity/` each have a clear `index.ts` public entry over `{application,domain,infrastructure,http}` internals. `platform/` has no single `index.ts` — it's organized as independent sub-features (`database/`, `health/`, `outbox/`, `security/`, `tenancy/`), each already a self-contained unit. The public-entry rule will apply to `audit` and `identity` only; `platform`'s existing sub-feature boundaries are not restructured to manufacture a false single entry point.
- No `nock` in the repo. The only existing network-mocking seam is MSW: `packages/testing/src/msw/node.ts` (`createMswServer`/`setupMswServerLifecycle`, default `onUnhandledRequest: "error"`) and `packages/contracts/src/msw/index.ts` (generated default handlers per OpenAPI operation). Nothing today forces every test file to use this seam, and nothing blocks a raw `fetch`/`axios`/`undici` call that bypasses MSW entirely. No `provider-smoke.yml` exists. No real provider adapter/module exists yet (the only stripe/twilio/etc. references are a deliberately-violating dependency-cruiser fixture, not product code).
- `heavy.yml` header comment: `# T074 foundation only; not full T087 completion. Never deploys the application.` Its three jobs (`migration-checklist`, `migration-proof`, `release-migrations`) cover migration proof only. Real-PG integration tests and Playwright journeys 6/7 currently run in `e2e.yml`, separately. Security scans run in `security.yml`, separately. No axe checks, no visual regression, and no sharding exist anywhere today.
- `playwright.config.ts` has no visual-regression project (`workers: 1`, no `toHaveScreenshot` usage). `packages/ui/.storybook/main.ts` has only `@storybook/addon-a11y` — no visual-regression addon. Existing stories are 9 system-state presentations under `packages/ui/src/system-states/`; there are no separate "shell primitive" stories today, so T088's scope is exactly those 9 stories in Light + Dark.
- Root scripts include `verify:fast`, `verify:integration`, `verify:pr` (`tooling/verify/run.mjs`), which orchestrate existing pnpm scripts. No root `storybook` or dedicated visual-regression script exists yet.
- `docs/runbooks/` exists (`deployment.md`, `local-dev.md`, `migration-release.md`) but has no `perf-baselines.md` yet. `docs/standards/ci-quality-gates.md` documents heavy-lane obligations but has no recorded founder-approved time budget.

## T085 — Dependency-cruiser tightening

Three new `forbidden` rules, additive only, in `tooling/dependency-cruiser/.dependency-cruiser.cjs`:

1. **`module-public-entry-only`** — for `apps/api/src/modules/{audit,identity}`: forbid any file outside `modules/<name>/` from importing a path matching `modules/<name>/(application|domain|infrastructure|http)/`. Files inside the same module, and `__tests__`/`__fixtures__` paths, are exempt (mirrors the existing `no-cross-module-internals` exemption style). This is narrower than the existing cross-module rule (which only blocks `infrastructure/repositories/repository/schema`) — it extends the same violation shape to all internal layers, for the two modules that actually have a settled public-entry convention. `platform/` is intentionally out of scope for this specific rule (no invented entry point).
2. **`contracts-generated-import-direction`** — forbid `packages/contracts/src/generated/**` from importing anything under `packages/contracts/src/` that isn't itself inside `generated/` (generated code must not depend on hand-written code), and forbid other workspace packages from deep-importing `packages/contracts/src/generated/*` directly — they must go through `packages/contracts/src/index.ts` or `packages/contracts/src/msw/index.ts` (already covered structurally by the existing `no-deep-import-across-packages` rule's public-entry allowlist, but that rule doesn't yet list `packages/contracts`'s `msw` subpath export explicitly — will confirm/add if needed once `package.json` `exports` is inspected during implementation).
3. **`test-harness-not-in-production-graph`** — forbid any import of `apps/web/src/test-harness/` from outside that directory and outside `apps/web/e2e/`, **except** the one known, allowlisted dynamic `import()` edge in `apps/web/src/app/router.tsx`. This is defense-in-depth alongside (not a replacement for) the existing `production-bundle.test.ts` build-output proof, which remains the authoritative check per the issue's acceptance criteria ("production graph/build mechanically excludes the test harness").

Each new rule gets a focused violating fixture under `tooling/dependency-cruiser/__fixtures__/<rule-name>/` plus a compliant counterpart, and a new `it.each` entry in `tooling/dependency-cruiser/__tests__/rules.test.ts` (extending the existing `VIOLATION_CASES` array and the "every core forbidden rule is covered by a fixture" completeness check). No existing rule is edited or weakened.

## T086 — Provider-mock / network enforcement + provider-smoke lane

**Enforcement seam (fast + heavy lanes), per your direction — MSW-mandatory + socket-level denylist:**

- A new global Vitest setup module (e.g. `packages/testing/src/msw/deny-network.ts`) that: (a) makes the existing `setupMswServerLifecycle` pattern's `onUnhandledRequest: "error"` behavior mandatory by wiring it as a `setupFiles` entry in the root `vitest.config.ts` and in `apps/api`/`apps/worker`'s integration Vitest configs; (b) additionally patches/guards Node's low-level connection primitives (`net.connect`/`http(s).request`/global `fetch` dispatcher) so that any outbound connection attempt to a host that is not `localhost`/`127.0.0.1`/an explicitly allowlisted Testcontainers-assigned port fails immediately with a clear error, independent of whether the calling code goes through MSW at all. This catches both "forgot to mock" (MSW layer) and "bypassed MSW entirely" (socket layer).
- Explicit non-blocking allowlist: `localhost`/`127.0.0.1` (Playwright's local app/API servers, Testcontainers-assigned ports), and pnpm/package-registry installation happens before this setup file loads (install is a separate CI step, not inside the Vitest process).
- A deliberately-unmocked provider-call test fixture proving the guard fires with a clear failure in a normal test context.

**New `.github/workflows/provider-smoke.yml`:**

- Triggers: `workflow_dispatch` and a scheduled `cron`.
- Provider credentials/secrets scoped only to this workflow's job/environment — never present in `fast.yml` or `heavy.yml`.
- Since Phase 1 has no real provider adapter or sandbox contract yet (verified — no billing/notifications module exists), this lane will **not** fabricate a provider integration. It will implement the smallest truthful seam: verify the scoped-secrets context is wired and reachable, and run whatever narrow contract check already exists (if any) against the CI seam itself, with the workflow's own summary/output stating plainly that no Phase-1 provider adapter exists yet and this lane currently proves the isolated-credential lane mechanism, not a real provider round-trip. This avoids the explicit prohibition on claiming a provider sandbox was exercised when none exists.

## T087 — Complete heavy lane

`heavy.yml` gains jobs composed from what already exists, rather than duplicated:

- Keep existing `migration-checklist` and `migration-proof` jobs (T074 foundation, unchanged).
- Add a job (or `workflow_call`/`needs` composition) that runs what `e2e.yml` already runs — real-PG integration tests and Playwright journeys — so heavy.yml becomes the actual required-before-merge gate the issue describes, without maintaining two parallel real-PG/Playwright pipelines long-term. Exact mechanism (fold `e2e.yml`'s job into `heavy.yml` directly vs. `heavy.yml` depending on `e2e.yml` via `workflow_call`) will be decided during implementation by inspecting whether `e2e.yml` needs to keep existing independently (it's currently a required PR check per the issue's "passed all four PR workflows: fast, e2e, heavy, security" — so it likely stays a separate required workflow, and `heavy.yml` will instead absorb axe + visual regression + a summary/security-scan reference, per the acceptance criterion "do not duplicate work gratuitously across fast/e2e/security if current architecture can compose existing scripts cleanly").
- Add axe accessibility assertions to the Playwright journeys already covered.
- Add the T088 visual-regression job.
- Reference/require `security.yml`'s existing scans rather than re-running them, unless composition proves impractical.
- Shard the Playwright/visual jobs where useful (matrix strategy).
- Preserve `release-migrations`'s founder-only gating exactly as-is.

## T088 — Targeted visual regression

- Build Storybook (`packages/ui`) and serve it statically in CI; add a Playwright project (or a small dedicated script) that navigates to each of the 9 existing system-state stories in both Light and Dark, waits for fonts/animations to settle (using the existing `reduced-motion.css`/`prefers-reduced-motion` infra referenced in `apps/web/src/main.tsx` and `apps/web/src/app/shell/__tests__/theming.test.tsx`), and takes a `toHaveScreenshot` snapshot at a fixed viewport.
- No new stories are invented for "shell primitives" beyond what exists — scope is exactly the 9 current stories, matching ground truth.
- Baseline screenshots committed under a new, clearly-named convention (e.g. `packages/ui/.storybook-visual/__screenshots__/`) since no visual-regression baseline convention exists yet in the repo.
- No product-route snapshots, no full-DOM snapshots.

## T089 — Performance baselines + budget gate

- New `docs/runbooks/perf-baselines.md`: record actual measured `time`-wrapped output from this worktree for install, build, `test`, and `du -sh`-measured route bundle sizes. No invented numbers.
- Add the measurement/enforcement mechanism (a small script comparing heavy-lane duration against a budget value) so it's ready to enforce once a budget is approved, but the budget value itself stays an explicit pending placeholder in `docs/standards/ci-quality-gates.md` until: the completed heavy workflow has actually run in GitHub Actions, and the founder has approved an explicit number. T089 stays unchecked in `tasks.md` until both conditions are met.

## `.slotnova/CURRENT.md` refresh

Narrow update only: PR-18/#51 merged, current verified main SHA, PR-19/#52 active, remove stale PR-17-next framing. No other content changes.

## Testing

- `tooling/dependency-cruiser/__tests__/rules.test.ts` — new fixture cases per T085 rule.
- New test proving the network-egress guard blocks an unmocked provider call (T086).
- Visual regression snapshot tests themselves are the T088 test surface (Playwright `toHaveScreenshot` against Storybook).
- Existing `production-bundle.test.ts` untouched, still passes.
- `pnpm verify:fast`, `pnpm verify:integration`, and the new visual/provider-guard checks run locally before push.

## Explicitly out of scope

- Any real provider SDK integration or credentials committed to the repo.
- T090/T091 Phase-1 exit reconciliation beyond the narrow `.slotnova/CURRENT.md` snapshot refresh.
- k6/production load budgets.
- Recording or claiming a founder-approved heavy-lane time budget before it is actually approved.
- Merging or enabling auto-merge — founder merges manually.
