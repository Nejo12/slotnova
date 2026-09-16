# 0002 — Exact Version Pins & Lockfile Policy (R2)

Status: **Founder-approved, conditional on exact patch pinning being genuinely implemented.** The founder's first review of this record (PR-20 follow-up) found the original draft did not satisfy T080's accept criteria ("exact patches pinned after a documented compatibility run") because it left every non-exact dependency as a caret/tilde range. This revision converts every applicable `dependencies`/`devDependencies` semver range across the workspace to the exact patch version already resolved in the committed lockfile, and records the compatibility evidence honestly below — there was no separate dedicated R2 compatibility-spike PR (unlike R1/R3/R4, each of which had one); the evidence is each dependency's own introducing PR having passed the fast+heavy gates, plus this follow-up's own full local verification pass against the newly-pinned tree.

## Decision

- **Toolchain**: Node `>=24.20.0 <25` (`package.json` `engines`, `.nvmrc` = `24.20.0`), pnpm `12.3.4` (`package.json` `packageManager`, enforced via Corepack).
- **Exact patch pin, every ordinary `dependencies`/`devDependencies` entry, every workspace package**: as of this record, **every** non-`workspace:*` dependency and devDependency across all 14 workspace `package.json` files is pinned to an exact version (no `^`/`~` prefix). This was previously true only for a subset (`fastify`, `zod`, the R4/R3 provider-adapter sets); this revision converted the remaining 80 caret/tilde-ranged specifiers (across `package.json`, `apps/api`, `apps/web`, `packages/contracts`, `packages/db`, `packages/design-tokens`, `packages/eslint-config`, `packages/testing`, `packages/ui`) to the exact patch version each was already resolving to in `pnpm-lock.yaml` at the time of this revision — see "Compatibility evidence" below for how that was verified safe.
- **`peerDependencies` are intentionally excluded from exact pinning.** `packages/ui`'s `react`/`react-dom` peer ranges (`^19.3.0`) remain caret ranges. A peer dependency declares what a *consumer* of the package must already have, not what this repository installs for itself — pinning it to a single exact patch would impose a stricter compatibility requirement on internal consumers of `@slotnova/ui` than the package actually needs, which is a real (if small) behavioral/architectural change, not "pinning the already-tested tree." R2's own scope (`research.md`'s table: Node, pnpm, Turborepo, React, Vite, NestJS/Fastify, Drizzle, PostgreSQL, Vitest, Playwright, Storybook) is about the dependency surface actually installed and exercised, which `peerDependencies` metadata is not.
- **Committed lockfile**: `pnpm-lock.yaml` is committed and every CI/local verification path runs `pnpm install --frozen-lockfile` (`.github/workflows/fast.yml`, `heavy.yml`, `e2e.yml`, `security.yml`, `provider-smoke.yml`, `tooling/verify/run.mjs`) — an out-of-sync lockfile fails installation outright rather than silently resolving a different tree.

## No-automated-major-upgrades policy

There is currently **no automated dependency-upgrade tool configured** (no Dependabot, no Renovate, confirmed by absence of any `.github/dependabot.yml` or `renovate.json` in the repository). This means, as a simple fact of the current setup rather than a written rule enforced by tooling: no dependency version — major, minor, or patch — changes without a human-authored commit that updates `package.json`/`pnpm-lock.yaml` and passes the fast+heavy gates. The "no auto major upgrades to `main`" requirement (T080's accept criteria) is satisfied by this absence of automation, not by a configured allowlist that blocks majors specifically.

If/when an automated dependency-update tool is introduced in a later phase, it must be configured to open PRs only (never auto-merge, consistent with the repository-wide no-auto-merge policy — `docs/standards/ci-quality-gates.md`'s "Merge policy") and should default to patch/minor updates only, with major-version bumps requiring an explicit human decision citing this record. That configuration does not exist yet and is not part of this Phase 1 exit.

## Compatibility evidence

No dependency version resolution changed as part of this pinning revision — every exact pin written was already the version `pnpm-lock.yaml` was resolving that specifier to, verified as follows:

1. Each of the 80 converted specifiers was cross-referenced against `pnpm-lock.yaml`'s `importers.*.{dependencies,devDependencies}.<name>.version` field programmatically before any edit was made, so every pinned value is the exact patch this repository was already installing and testing against, not a value chosen independently.
2. After editing every `package.json`, the lockfile was regenerated (`pnpm install`) and diffed against its pre-edit state: **every changed line in `pnpm-lock.yaml` is a `specifier:` metadata line; zero lines changed in the lockfile's `packages:` (resolved dependency tree) or `snapshots:` (dependency graph) sections.** This is the proof that only the declared-range metadata tightened — no dependency actually moved to a different version.
3. `pnpm install --frozen-lockfile` succeeds against the regenerated lockfile (self-consistency proof).
4. Full local verification re-run against the newly-pinned tree, all green: `pnpm verify:fast` (9/9), `pnpm verify:integration` (2/2, real PostgreSQL/Testcontainers), `pnpm contracts:check`, `pnpm lint:boundaries` (0 violations), `pnpm e2e` (5/5), `pnpm format:check`.
5. Each individual dependency's own introducing PR (across PR-01 through PR-19) already passed the fast+heavy CI gates at the caret-range version that resolved to the now-pinned exact patch — this pinning revision does not introduce any dependency this repository hasn't already been continuously testing against.

## Evidence

- `package.json` `engines`/`packageManager`; `.nvmrc`.
- `pnpm-lock.yaml` (committed, `lockfileVersion: '9.0'`).
- `.github/workflows/*.yml` — every workflow's install step uses `pnpm install --frozen-lockfile`.
- `docs/decisions/0003-job-scheduler.md`, `0004-validation-contract-integration.md` — the two dependency sets with their own dedicated compatibility-spike evidence, unaffected by this revision (already exact pins).
- Absence of `.github/dependabot.yml` / `renovate.json` (verified by directory listing at Phase 1 exit).
