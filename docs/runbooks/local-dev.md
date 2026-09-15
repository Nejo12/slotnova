# Local Development Runbook

Covers the Slotnova monorepo bootstrap delivered in PR-01 (tasks T001–T008 of
`specs/001-platform-foundation-shell/tasks.md`), extended by PR-06 (T025–T028)
with runnable `apps/web` / `apps/worker` skeletons and fast-lane hardening.
Later PRs extend this further.

## Prerequisites

| Tool | Version | Source of truth |
|---|---|---|
| Node.js | **24.20.0** (current Node 24 LTS) | `.nvmrc`, `package.json` → `engines.node` (`>=24.20.0 <25`) |
| pnpm | **12.3.4** (current stable major) | `package.json` → `packageManager`, managed by Corepack |
| Git | any recent | — |

```bash
# one-time
corepack enable          # lets pnpm resolve to the pinned packageManager version
node -v                  # must satisfy engines.node
```

A container runtime (Docker / Podman / colima) is **not** needed for PR-01. It is
required from PR-02 onward for real-PostgreSQL tests.

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm install` | Cold-installs the workspace. Only build scripts allowlisted in `pnpm-workspace.yaml` → `allowBuilds` run. |
| `pnpm build` | `turbo run build` across the workspace. Builds all application/package artifacts. |
| `pnpm typecheck` | `tsc --noEmit` with the strict flag set from `@slotnova/tsconfig`. |
| `pnpm lint` | ESLint flat config (`eslint.config.mjs` → `@slotnova/eslint-config`). |
| `pnpm lint:styles` | Stylelint (`stylelint.config.cjs` → `tooling/stylelint/`). Raw-value ban is scaffolded, enabled in PR-12. |
| `pnpm lint:boundaries` | dependency-cruiser architecture-boundary rules over `apps/` + `packages/`. |
| `pnpm test` | Vitest (unit / property). |
| `pnpm test:integration` | Real-PostgreSQL integration tests (`packages/db`, `apps/api`) via Testcontainers — requires a container runtime. |
| `pnpm format` / `pnpm format:check` | Prettier write / check. |
| `pnpm db:migrate` | Runs the gated migration runner (standalone step, never app-startup). |
| `pnpm dev:api` | `apps/api` — NestJS + Fastify on `:3001` (watch mode via `tsx`). |
| `pnpm dev:web` | `apps/web` — Vite SPA on `:3000`. |
| `pnpm dev:worker` | `apps/worker` — outbox consumer and scheduler (watch mode via `tsx`). |

## Running the three apps

All commands now require an explicit deployment class. Use `SLOTNOVA_ENV=local`
for development and `SLOTNOVA_ENV=preview` for builds/tests. Read the process-specific
placeholder reference in `.env.example`; Node does not automatically load it.
Export only the values needed by each process. The Vite dev server uses port 3000.

```sh
export SLOTNOVA_ENV=local
# Supply a reachable ordinary DATABASE_URL, and apply explicit migrations first.
API_SECURE_COOKIES=false API_ENABLE_HSTS=false \
API_CORS_ALLOWED_ORIGINS=http://localhost:3000 pnpm dev:api
# Separate terminals, with their own environment:
SLOTNOVA_ENV=local pnpm dev:web
# Supply WORKER_DATABASE_URL and initialize pg-boss separately first:
SLOTNOVA_ENV=local pnpm dev:worker
```

API bootstrap now checks runtime database privileges before listening. `/healthz`
is process liveness after startup; `/readyz` also checks migrations/outbox access.
The worker runs the PR-16 consumer and scheduler, not a keep-alive skeleton.
Follow [migration release](migration-release.md) for business/scheduler ordering and
[deployment](deployment.md) for role separation. No Docker Compose provisioning
or automatic startup migration is added here. Integration tests provision their
own disposable PostgreSQL through Testcontainers.

## Architecture-boundary enforcement

`tooling/dependency-cruiser/.dependency-cruiser.cjs` holds the **core** ruleset,
in force from PR-01 so no module is ever built without it:

- frontend (`apps/web`, `packages/ui`) must not import DB / server-infrastructure code
- domain / application layers must not import a provider SDK directly
- one backend module must not import another module's repository / schema / infrastructure
- no circular dependencies
- server-only observability must not enter a browser bundle
- no deep imports past a package's public entry point
- no unresolvable dependencies

Each rule has a failing fixture under `tooling/dependency-cruiser/__fixtures__/`
proven by `tooling/dependency-cruiser/__tests__/rules.test.ts`. Rule *tightening*
(per-module public-entry allowlists, `packages/contracts` import direction, the
test-harness production-graph guard) is deferred to PR-19 (task T085).

## Toolchain pins (PR-01)

Runtime and package manager follow the `research.md` R2 baseline exactly:

- **Node 24.20.0** — current Node 24 LTS, latest patch at pin time. `.nvmrc`,
  `engines.node` (`>=24.20.0 <25`) and CI (`node-version-file: .nvmrc`) all pinned
  to the Node 24 line.
- **pnpm 12.3.4** — current stable major, via Corepack (`packageManager`). pnpm
  12's supply-chain controls are kept ON:
  - `pnpm-workspace.yaml` → `allowBuilds` allowlists **only** `unrs-resolver`
    (the one package that genuinely needs a postinstall — it links the prebuilt
    napi resolver binding for `eslint-plugin-import-x`).
  - `pnpm-workspace.yaml` → `minimumReleaseAgeExclude` keeps the package-age
    cooldown active for every dependency except the deliberately-selected
    `typescript-eslint` 8.70.0 family (the version that officially supports the
    pinned TypeScript 6.0.x). Every excluded version is also frozen in
    `pnpm-lock.yaml` and reviewed in T080.

One deliberate deviation, an explicit Phase-1-exit concern for task T080
(`docs/decisions/0002-version-pins.md`):

- **TypeScript `~6.0.3`, not 7.** `typescript` 7.x (the native port) is
  published, but `typescript-eslint@8.70` officially supports only
  `typescript >=4.8.4 <6.1.0`. Pinning TS 6.0.x keeps the lint + type toolchain
  on a supported combination. T080 re-checks once `typescript-eslint` (and other
  TS-API consumers) support TS 7.

Exact versions are pinned by `pnpm-lock.yaml`; `package.json` uses caret/tilde
ranges until T080 locks them.

## CI

`.github/workflows/fast.yml` runs the same gates on every PR and on pushes to
`main`. Target: under 3 minutes on a warm Turborepo cache. The heavy lane
(real PostgreSQL, migrations, Playwright, a11y, security scans) is a separate
required workflow added in a later PR. Auto-merge is disabled at the repository
level; the founder performs the final merge.

Optional Turborepo remote cache: set the repo/org secret `TURBO_TOKEN` and the
variable `TURBO_TEAM`.

### Reproducing the fast lane locally from a clean checkout

Before opening a PR, reproduce the exact `.github/workflows/fast.yml` command
sequence locally, in order, from an unbuilt state — package resolution must
never depend on stale local `dist` output (PR-05 lesson):

```bash
rm -rf apps/*/dist packages/*/dist
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm lint:styles
pnpm lint:boundaries
pnpm typecheck
pnpm test
pnpm build
```

All eight steps must pass, in this order, before pushing. A second `pnpm
build` run afterward should show `>>> FULL TURBO` (every task cache-hit) —
proof that unchanged packages are cache-reused (FR-008).

## Branch protection & merge policy

- Auto-merge is disabled at the **repository** level
  (`allow_auto_merge: false` — confirmed via `gh api repos/<org>/slotnova`).
  This is enforced by GitHub regardless of branch protection configuration.
- The `fast` workflow is a required status check on `main`. This repository's
  current plan does not expose the branch-protection API
  (`GET /repos/{owner}/{repo}/branches/{branch}/protection` returns 403 —
  "Upgrade to GitHub Pro or make this repository public"), so the exact
  required-checks list cannot be read back and verified from tooling. This is
  a plan-tier limitation to flag to the founder, not something to work around
  or infer a replacement for.
- `.github/CODEOWNERS` names the founder (`@Nejo12`) as owner of the whole
  tree — this satisfies GitHub's required-reviewer wiring; it does not imply
  a review team that does not exist.
- The founder performs the final merge on every PR. Agents never merge, never
  enable auto-merge, and never bypass a required check.

## Contributor onboarding verification (T028)

`docs/runbooks/local-dev.md` plus the README quickstart are intended to get a
new contributor from a clean clone to all three apps running in under 30
minutes (SC-001), using only:

```bash
corepack enable
nvm install && nvm use   # or any Node 24.20.0–<25 toolchain
pnpm install
pnpm build && pnpm typecheck && pnpm lint && pnpm lint:styles && pnpm lint:boundaries && pnpm test
pnpm dev:api    # separate terminal
pnpm dev:web    # separate terminal
pnpm dev:worker # separate terminal
```

**Status: pending founder/manual second-person verification.** No second
person has run this sequence independently as part of this PR — an AI agent
running its own instructions is not a substitute for an independent human dry
run. Do not treat this checklist item as satisfied until a second person
records the result in the PR.
