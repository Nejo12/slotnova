# 0002 — Exact Version Pins & Lockfile Policy (R2)

Status: **Pending founder review.** Documents shipped, already-in-force pinning practice — no separate compatibility spike PR exists for this record (unlike R1/R3/R4, which each had a dedicated research/spike task before their decision record); the pins below accumulated PR-by-PR across Phase 1 as each dependency was introduced, verified by that PR's own green fast+heavy run. This record consolidates that evidence rather than re-running a fresh compatibility pass. Written as part of PR-20's T090/T091 documentation reconciliation; founder approval of this record itself is outstanding and must be obtained before T080 is checked complete in `tasks.md`.

## Decision

- **Toolchain**: Node `>=24.20.0 <25` (`package.json` `engines`, `.nvmrc` = `24.20.0`), pnpm `12.3.4` (`package.json` `packageManager`, enforced via Corepack).
- **Exact pins (no caret range)** for dependencies where a routine minor/patch bump carries meaningful behavioral risk: `fastify@5.12.1`, `zod@4.6.5` (applied consistently across every workspace package that depends on it: `apps/api`, `apps/web`, `apps/worker`, `packages/deployment-config`), and the provider-adapter set recorded in `docs/decisions/0004-validation-contract-integration.md` (`nestjs-zod@5.5.0`, `@nestjs/swagger@12.0.1`, `openapi-typescript@7.13.0`, `openapi-fetch@0.17.0`, `openapi-msw@2.0.0`) and `docs/decisions/0003-job-scheduler.md` (`pg-boss@12.31.1`).
- **Caret-range pins (`^x.y.z`)** for the remaining dependency surface (`react`/`react-dom@^19.3.0`, `vite@^8.2.2`, `vitest@^5.0.0`, `@nestjs/core@^12.0.1`, `drizzle-orm@^0.45.2`, `@playwright/test@^1.63.0`, `storybook@^10.6.0`, `msw@^2.15.0`, etc.) — patch/minor bumps are allowed within the pinned major, major bumps are not.
- **Committed lockfile**: `pnpm-lock.yaml` is committed and every CI/local verification path runs `pnpm install --frozen-lockfile` (`.github/workflows/fast.yml`, `heavy.yml`, `e2e.yml`, `security.yml`, `provider-smoke.yml`, `tooling/verify/run.mjs`) — an out-of-sync lockfile fails installation outright rather than silently resolving a different tree.

## No-automated-major-upgrades policy

There is currently **no automated dependency-upgrade tool configured** (no Dependabot, no Renovate, confirmed by absence of any `.github/dependabot.yml` or `renovate.json` in the repository). This means, as a simple fact of the current setup rather than a written rule enforced by tooling: no dependency version — major, minor, or patch — changes without a human-authored commit that updates `package.json`/`pnpm-lock.yaml` and passes the fast+heavy gates. The "no auto major upgrades to `main`" requirement (T080's accept criteria) is satisfied by this absence of automation, not by a configured allowlist that blocks majors specifically.

If/when an automated dependency-update tool is introduced in a later phase, it must be configured to open PRs only (never auto-merge, consistent with the repository-wide no-auto-merge policy — `docs/standards/ci-quality-gates.md`'s "Merge policy") and should default to patch/minor updates only, with major-version bumps requiring an explicit human decision citing this record. That configuration does not exist yet and is not part of this Phase 1 exit.

## Evidence

- `package.json` `engines`/`packageManager`; `.nvmrc`.
- `pnpm-lock.yaml` (committed, `lockfileVersion: '9.0'`).
- `.github/workflows/*.yml` — every workflow's install step uses `pnpm install --frozen-lockfile`.
- `docs/decisions/0003-job-scheduler.md`, `0004-validation-contract-integration.md` — the two dependency sets with their own dedicated compatibility-spike evidence.
- Absence of `.github/dependabot.yml` / `renovate.json` (verified by directory listing at Phase 1 exit).
