# Performance Baselines (Phase 1, T089)

Recorded from a clean checkout of `feat/pr-19-hardening-ci-visual-perf` at
commit `8fc611b8dc3a24998e930c9f5ca1eca95171f7da`, Node `24.20.0`, on
`Darwin MacBookAir.fritz.box 25.6.0 Darwin Kernel Version 25.6.0 arm64`
(Apple Silicon). These are local developer-machine measurements, not
CI-machine measurements — CI timing (recorded separately below once
available) is the authoritative number for the heavy-lane budget decision.
GitHub-hosted `ubuntu-latest` runners are typically slower single-core than
a local Apple Silicon machine, so these numbers should be read as a lower
bound, not a prediction of CI duration.

## Install (`pnpm install --frozen-lockfile`)

`0.36s user 1.87s system 110% cpu 2.026s total` (pnpm's local package store
was already warm from earlier work in this same session, so this is not a
representative cold-cache/cold-network install time — a genuinely cold
install, as GitHub Actions' `actions/setup-node` cache miss would produce,
was not measurable in this environment without discarding the pnpm store.
The heavy-lane/CI run is the authoritative source for a real cold install
number.)

## Build (`pnpm exec turbo run build --force`, full Turborepo pipeline, cache bypassed)

`14.74s user 1.70s system 351% cpu 4.680s total` (Turbo-reported task time:
`4.54s`; 11 tasks, 0 cached — genuinely cold build across all 11 workspace
packages/apps).

## Unit/property tests (`pnpm test`)

`37.71s user 7.20s system 580% cpu 7.738s total` (Vitest-reported: `70`
test files, `437` tests, `7.08s` duration — high user/system time relative
to wall clock reflects Vitest's per-file worker isolation across multiple
CPU cores).

## Route bundle sizes (`apps/web` production build)

| Asset | Raw | Gzip |
|---|---|---|
| `dist/assets/index-*.js` | 361.15 kB | 112.79 kB |
| `dist/assets/index-*.css` | 38.76 kB | 6.00 kB |
| `dist/index.html` | 0.39 kB | 0.26 kB |

Single-route SPA shell at this stage of Phase 1 (no route-based code
splitting yet — `apps/web`'s router currently ships one bundle covering the
whole shell).

## Architecture boundary check (`pnpm lint:boundaries`, T085)

`1.14s user 0.16s system 142% cpu 0.917s total` (`351` modules, `811`
dependencies cruised, 0 violations — includes the three new T085 rules).

## Targeted visual regression (`packages/ui` `test:visual`, T088)

`18` screenshots (9 stable "System States/\*" stories × Light/Dark),
verified deterministic (0 diffs) across three consecutive local runs and
two consecutive runs inside `mcr.microsoft.com/playwright:v1.63.0-noble`
(the Linux baselines actually committed, since CI's `ubuntu-latest` runner
would never match locally-generated macOS/darwin-suffixed screenshots).
Per-run wall time: `~17-21s` for all 18 screenshots.

## Heavy-lane duration baseline

**Recorded.** Observed GitHub Actions run of the completed `heavy.yml`
workflow on this PR:

- Repository: `Nejo12/slotnova`
- PR: [#53](https://github.com/Nejo12/slotnova/pull/53)
- Branch: `feat/pr-19-hardening-ci-visual-perf`
- Head SHA: `218cf73095d5ef21c1da27ea4a973c9151f023bf`
- Run: [`35119891244`](https://github.com/Nejo12/slotnova/actions/runs/35119891244), conclusion `success`
- Started: `2026-09-16T16:07:44Z`
- Completed: `2026-09-16T16:09:17Z`
- **Observed duration: 93 seconds**

This is the workflow's actual wall-clock duration (from the Actions API's
own `createdAt`/`updatedAt` for the run), independently re-verified via
`gh run list` against the live API rather than taken on faith, not a sum or
estimate of the individual parallel jobs below.

Locally-measured components that compose the heavy lane, for rough
orientation only (not a substitute for the real CI run measured above):

- `pnpm --filter @slotnova/db test:integration` (real PostgreSQL,
  Testcontainers): `10.55s` (4 files, 14 tests)
- `pnpm --filter @slotnova/api test:integration` (real PostgreSQL, Nest
  app boot): `59.55s` (22 files, 178 tests)
- `pnpm --filter @slotnova/worker test:integration` (real PostgreSQL,
  scheduler/outbox concurrency): `109.24s` (5 files, 23 tests)
- `pnpm e2e` (Playwright journeys + shell a11y/axe): `13.0s` (5 tests)
- `packages/ui test:visual` (visual regression): `~17-21s` (18 screenshots)

These do not sum to a heavy-lane total because `heavy.yml`'s jobs run in
parallel on separate runners, each paying its own checkout/install/build
cost independently — the real total is whatever GitHub Actions reports for
the slowest job plus scheduling overhead, not a serial sum of the above.

## Founder-agreed heavy-lane pre-merge time budget

**APPROVED: 180 seconds (3 minutes).**

The founder reviewed the observed GitHub Actions heavy-lane baseline above
(93 seconds on PR #53, head `218cf73`) and approved a 180-second pre-merge
budget — roughly 2x headroom over the observed baseline, room for slower
GitHub-hosted-runner conditions (cold cache, contention) without the gate
being trivially tight.

This is a **Phase-1 baseline budget**, not a permanent ceiling: it reflects
the current heavy-lane job set (`migration-checklist`, `migration-proof`,
`visual-regression`, `accessibility`, `security-scan-reference`). If the
architecture or test scope in the heavy lane materially changes — a new
required job, a substantially heavier existing one, additional Playwright
journeys, more visual-regression baselines, real-PG suites growing
significantly — this budget must be deliberately revisited and re-approved
by the founder, not silently left in place or silently widened by an
implementer. Recorded identically in
`docs/standards/ci-quality-gates.md`'s "Heavy-lane pre-merge time budget"
section and enforced via `tooling/perf/check-heavy-budget.ts` (see that
file and `.github/workflows/heavy.yml`'s `budget-check` job for the
enforcement mechanism).
