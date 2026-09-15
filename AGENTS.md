# AGENTS.md

## Purpose

This repository implements Slotnova from founder-approved product decisions, committed architecture/specifications and approved Figma. AI agents must preserve accepted behavior and keep changes bounded.

## Authority

Read `.specify/memory/constitution.md` first.

For implementation work:

1. current GitHub `main` + founder-approved decisions
2. accepted ADRs / committed architecture + product specification
3. approved Figma for visual/interaction detail
4. linked feature specification and GitHub issue
5. technical plan / PR
6. tests as executable evidence

If higher-order sources conflict, stop and surface the conflict rather than guessing.

### Figma caveat

Some generic Figma APIs expose only `00 — Cover` for the Slotnova file even though the Plugin API verifies the full 61-page corpus. If your tooling cannot access a referenced Figma page, use `docs/product-handoff.md` and the linked specification; never infer or invent UI behavior from an incomplete API response.

## Pre-implementation rule

No product implementation begins until `docs/architecture/phase-0-gate.md` is approved.

## Hard product invariants

- Recovery and Retention are different domains.
- first valid Recovery acceptance wins; competing offers close; recovered value is attributed exactly once.
- mobile navigation is `Home · Calendar · Clients · Recovery · More` unless founder-approved product changes say otherwise.
- mobile layouts are deliberate substitutions, not compressed desktop layouts.
- Light/Dark is semantic-token driven.
- destructive actions communicate consequence and preserve a safe exit.
- recoverable system errors preserve user input.

## Hard engineering prohibitions

- no Tailwind unless explicitly approved
- no float-based money arithmetic
- no raw JavaScript `Date` in domain scheduling code
- no tenant-owned query that bypasses scoped repository/RLS policy
- no cross-domain repository/table import
- no state-changing HTTP GET
- no check-then-insert as the sole booking-overlap protection
- no provider SDK inside domain/UI code
- no generic `common/shared/core/utils/helpers` dumping-ground packages
- no `BaseService`, universal repository/entity abstraction, or wrapper around a single dependency without demonstrated repeated need
- no barrel-file layers that hide dependency direction/cycles
- never weaken a correct test to make CI green
- never enable auto-merge or merge a PR; founder merges manually

## Module tiering

Full DDD ceremony is reserved for core invariant-heavy modules: Scheduling, Booking, Recovery, Payments.

Supporting modules use lighter application/infrastructure structure and gain extra domain abstractions only when real invariants justify them.

Generic/platform modules stay thin.

Apply the **rule of three** before extracting shared abstractions.

## Frontend baseline

- React + strict TypeScript + Vite SPA
- React Router data router
- TanStack Query owns server state; workspace-scoped query keys; clear cache on workspace switch/logout
- Zustand only for justified client-only state
- SCSS Modules + semantic design tokens
- CSS / View Transitions / Motion responsibility follows `docs/standards/motion.md`
- Storybook colocated with `packages/ui`

## Backend/data baseline

- Node LTS
- NestJS + Fastify adapter
- PostgreSQL + Drizzle
- modular monolith; per-module schema ownership
- PostgreSQL RLS for tenant isolation
- database exclusion constraints for booking overlap
- transactional outbox + separate Postgres-backed job scheduler
- OpenAPI generated from runtime API-boundary schemas; generated client artifacts only in `packages/contracts`

## PR rules

- start from current `main`
- one bounded issue per PR
- no unrelated redesign/refactor
- tests for changed behavior/invariants
- keyboard/focus/touch/reduced-motion/Light-Dark verification for changed UI
- no auto-merge; founder performs final merge

## Testing expectations

At minimum for each affected domain slice:

- happy path + representative failure
- state/invariant coverage at the lowest trustworthy layer
- real PostgreSQL for RLS/constraints/transactions/concurrency
- keyboard/accessibility assertions for changed interactive UI
- regression coverage for bug fixes

Concurrency tests use real concurrent connections; sequential calls are not concurrency tests.

## Agent execution discipline

### Worktree safety

- Never discard, reset, clean, stash or overwrite an existing dirty worktree unless the Founder explicitly authorizes that exact action.
- Never reuse another task's dirty worktree.
- When resuming an interrupted agent session, inspect the existing worktree before creating a replacement.
- Before recovery work, inspect at minimum: `git status`, current branch/HEAD, recent commits, current diff/untracked files.
- Preserve already-completed local work.

### Context economy

- Begin with the linked issue/task, AGENTS.md and directly relevant implementation files.
- Do not recursively read the whole repository, all ADRs, all specs, or entire app directories by default.
- Read additional sources only when a concrete dependency, conflict or uncertainty requires them.
- Prefer targeted search/file reads over broad repository ingestion.
- Existing accepted decisions should be reused rather than repeatedly researched.

### Verification responsibility

- During implementation, run focused tests/gates for the affected slice first.
- Run broader local verification when required by the task or when cross-cutting changes justify it.
- GitHub Actions is the normal clean-room/full-suite verifier after push.
- Do not automatically duplicate the same exhaustive full suite locally, in a second fresh checkout, and again in CI unless the task explicitly requires independent reproduction or a CI-only issue is being diagnosed.
- Never claim a test/check passed unless it actually ran successfully on the stated head.

### Delivery stopping gates

- A normal implementation-agent run should stop after: implementation → focused verification → review → commit → push.
- PR creation/CI inspection may be a separate short run.
- Do not sit polling GitHub CI unless explicitly instructed.
- After opening a PR, prefer stopping and allowing CI to run independently.
- If CI fails, resume with a narrowly scoped repair task for the failing job.
- Never merge or enable auto-merge; Founder performs every merge manually.

### Interrupted-session recovery

- After quota exhaustion, crash, timeout or tool interruption:
  1. recover current worktree state;
  2. determine what already completed;
  3. reuse valid prior results where no relevant files changed afterward;
  4. rerun only incomplete or invalidated checks;
  5. continue from the interruption point.
- Never restart the full task blindly merely because the previous agent session ended.
