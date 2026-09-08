# Local Development Runbook

Covers the Slotnova monorepo bootstrap delivered in PR-01 (tasks T001–T008 of
`specs/001-platform-foundation-shell/tasks.md`). Later PRs extend this.

## Prerequisites

| Tool | Version | Source of truth |
|---|---|---|
| Node.js | `.nvmrc` (currently **22**) | `.nvmrc`, `package.json` → `engines.node` (`>=22.13.0`) |
| pnpm | `package.json` → `packageManager` (currently **10.34.5**) | managed by Corepack |
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
| `pnpm install` | Cold-installs the workspace. Only build scripts in `pnpm.onlyBuiltDependencies` run. |
| `pnpm build` | `turbo run build` across the workspace. No unit produces build output yet. |
| `pnpm typecheck` | `tsc --noEmit` with the strict flag set from `@slotnova/tsconfig`. |
| `pnpm lint` | ESLint flat config (`eslint.config.mjs` → `@slotnova/eslint-config`). |
| `pnpm lint:styles` | Stylelint (`stylelint.config.cjs` → `tooling/stylelint/`). Raw-value ban is scaffolded, enabled in PR-12. |
| `pnpm lint:boundaries` | dependency-cruiser architecture-boundary rules over `apps/` + `packages/`. |
| `pnpm test` | Vitest (unit / property). |
| `pnpm format` / `pnpm format:check` | Prettier write / check. |

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

## Toolchain pin rationale (PR-01)

Two deliberate deviations from the `research.md` R2 baseline, both explicitly a
Phase-1-exit concern for task T080 (`docs/decisions/0002-version-pins.md`):

1. **Node 22, not 24.** The entire PR-01 toolchain (eslint 10, vitest 5,
   typescript-eslint 8, dependency-cruiser 18, turbo 2) supports Node 22, and 22
   is an active LTS. `research-basis.md` defers the exact pin to a Phase-1
   compatibility run. T080 verifies Node 24 and finalizes.
2. **TypeScript `~6.0.3`, not 7.** `typescript` 7.x (the native port) is
   published, but `typescript-eslint@8.70` still caps at `typescript <6.1.0`.
   Pinning TS 6.0.x keeps the lint + type toolchain coherent. T080 re-checks once
   `typescript-eslint` (and other TS-API consumers) support TS 7.
3. **pnpm 10.34.5, not the latest major.** pnpm 12's new supply-chain gates
   (`minimumReleaseAge` auto-exclusions written into `pnpm-workspace.yaml`) added
   friction to a clean bootstrap. pnpm 10 is current, stable and uses the same
   lockfile format. T080 revisits.

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
