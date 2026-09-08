# Local Development Runbook

Covers the Slotnova monorepo bootstrap delivered in PR-01 (tasks T001–T008 of
`specs/001-platform-foundation-shell/tasks.md`). Later PRs extend this.

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
