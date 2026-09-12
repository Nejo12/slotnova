# Implementation Plan: Phase 1 — Platform Foundation & Shell

**Branch**: `phase-1/platform-foundation-planning` (spec dir `specs/001-platform-foundation-shell`) | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-platform-foundation-shell/spec.md`

**Planning-only**: This branch produces `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md` and the Spec Kit analysis. No application code is authorized here.

## Summary

Phase 1 stands up Slotnova's executable platform foundation with **no product-domain behavior**: the pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `apps/worker` + shared packages), the React/Vite SPA shell (data router, TanStack Query with workspace-scoped keys + clear-on-switch, the Nova-UI design-system foundation — `@nova-component/ui` + `@nova-component/design-tokens` — consumed as pinned published dependencies per ADR-025 with a deterministic Slotnova Figma semantic-alias/override reconciliation layer, Light/Dark, reduced-motion, desktop/mobile shells, Storybook colocated in `packages/ui` for Slotnova-local stories only), the NestJS + Fastify API with the full Slotnova-owned session/authorization/RLS spine (credential verification behind the ADR-007 adapter; dev credential adapter for local/test; workspace invitation + membership acceptance; sign-out; workspace switch), the runtime-schema → OpenAPI → generated-client contract pipeline with RFC 9457 `problem+json`, the transactional outbox + separate Postgres-backed scheduler in `apps/worker`, the layered testing harness (Vitest, fast-check, Testing Library, MSW, Testcontainers real PostgreSQL, tenant-isolation tests, Playwright with journeys 6 & 7, axe, Storybook visual states), strict-TypeScript / ESLint / Stylelint / dependency-cruiser gates in GitHub Actions fast/heavy lanes with Turborepo caching and migration verification, structured logging + correlation IDs + OpenTelemetry seams + provider-neutral error reporting, and the four-class environment model (local, preview/CI, staging, production) with a gated migration release step and expand → migrate → contract policy.

The technical approach is almost entirely fixed by the accepted ADR-001…ADR-025 and `.specify/memory/constitution.md`; this plan records how those decisions compose and isolates the four (plus one conditional) **Phase 1 exit decisions** — managed provider, exact version pins, job-scheduler library, validation/contract integration, and production identity provider if required — as evidence-backed research tasks whose selection is a founder-approved decision record, not a plan-time default.

## Technical Context

**Language/Version**: TypeScript (strict) across the whole workspace. Node.js current LTS line (research baseline Node 24 LTS per `docs/architecture/research-basis.md`); exact patch pinned by the version-pin decision record (FR-066).

**Primary Dependencies** (all fixed by accepted ADRs; exact versions pinned at FR-066):
- Frontend: React (baseline 19.2), Vite (baseline 8), React Router data router (`createBrowserRouter`), TanStack Query, Zustand (only where justified), Zod at boundaries, SCSS Modules, `@nova-component/design-tokens` (pinned reviewed version per ADR-025) + Style Dictionary (or equivalent) for the Slotnova semantic alias/override reconciliation layer only — not a duplicate generic token pipeline, `@nova-component/ui` (pinned reviewed version per ADR-025) consumed through `packages/ui`, Storybook (in `packages/ui`, Slotnova-local stories only), Motion for React (code-split, richer transitions only).
- Backend: NestJS with Fastify adapter, Drizzle ORM, PostgreSQL (baseline 18 where the selected provider supports it, else newest provider-supported major preserving RLS/range/exclusion semantics), `@js-temporal/polyfill` (structure only in Phase 1 — no scheduling behavior), a runtime-schema→OpenAPI integration from ADR-013's candidate set (FR-068), a Postgres-backed job scheduler — graphile-worker or pg-boss (FR-067).
- Testing: Vitest, fast-check, @testing-library/*, MSW, Testcontainers, Playwright, axe.
- Tooling: pnpm, Turborepo, ESLint, Stylelint, dependency-cruiser, Prettier/formatter, GitHub Actions.

**Storage**: PostgreSQL only. Foundation schema: `identity` module (users, workspaces, locations, memberships, invitations, sessions), `audit` (append-only), `platform` (outbox, scheduler-owned tables per the selected library). Per-module Drizzle schema ownership; `packages/db` owns only client/migration-runner/test-harness. RLS on every tenant-owned table; transaction-scoped `SET LOCAL` workspace context.

**Testing**: Layered per ADR-006 / `docs/testing/strategy.md`. Fast lane: unit + property + changed-package component + boundary checks. Heavy lane: Testcontainers real-PostgreSQL integration, migration tests, Nest API integration, Playwright journeys (sign-in smoke, journey 6 workspace-switch isolation, journey 7 restricted-permission denial), axe, visual regression for shell primitives/system states. Concurrency tests use genuinely independent connections.

**Target Platform**: Linux server runtime for `apps/api` and `apps/worker` (containerized; provider-neutral). Modern evergreen browsers for `apps/web` (authenticated operator SPA; no SSR, no IE). Contributor dev environments: macOS and Linux first-class, Windows via WSL2.

**Project Type**: Multi-package monorepo — one web SPA, one API service, one worker service, plus shared library packages. (Template "web application" shape, extended.)

**Performance Goals** (Phase 1 records baselines; budgets tightened in later phases):
- CI fast lane < 3 minutes for a typical change on warm Turborepo cache.
- API health/context endpoint responds well within typical web expectations under no load.
- Shell first meaningful render on a mid-range laptop within typical SPA expectations; route-level code splitting in place.
- Deterministic contract/token generation (byte-identical on unchanged input).

**Constraints**:
- No product-domain behavior (FR-070).
- Tenant isolation DB-enforced, provable by real-PostgreSQL tests, including concurrency.
- No Tailwind; Light/Dark strictly semantic-token driven; `prefers-reduced-motion` respected globally.
- No float money arithmetic, no raw `Date` in domain scheduling code, no state-changing GET, no cross-module repository/table imports, no barrel files that hide cycles, no generic `common/shared/utils` packages, no `BaseService`/universal-repository abstractions (constitution VI, AGENTS hard prohibitions).
- No auto-merge; founder merges manually.
- Provider-neutral: no code path may depend on a specific managed host before FR-065.

**Scale/Scope**: Small founding team. Phase 1 surface: 3 deployables, ~10 shared packages, ~6 foundation tables, 1 foundation API module group (identity/session/health), 0 product features. The shell renders the full approved navigation with every product destination as an empty placeholder.

**NEEDS CLARIFICATION (all deliberately deferred to Phase 1 exit decision records, not plan-time defaults)**:
1. Managed hosting / PostgreSQL provider (FR-065) — research task R1; founder-approved record.
2. Exact runtime/dependency version pins (FR-066) — research task R2; recorded after compatibility verification.
3. graphile-worker vs pg-boss (FR-067) — research task R3.
4. Nest/Zod/OpenAPI integration from ADR-013 candidate set (FR-068) — research task R4.
5. Production identity provider, *only if required for Phase 1 exit* (FR-033e / FR-069a) — research task R5 (conditional).

These do not block the start of Phase 1 implementation: the monorepo, shell, token pipeline, testing harness, CI, observability seams, the session/authz/RLS spine on the dev credential adapter, and the outbox all proceed against adapter seams while the research is completed.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design. Source: `.specify/memory/constitution.md` + `AGENTS.md` hard prohibitions + `docs/standards/ci-quality-gates.md`.*

| # | Principle / rule | How this plan satisfies it | Status |
|---|---|---|---|
| I | Product truth is explicit; agents don't invent behavior | Plan derives only from accepted ADRs, the constitution, issue #2 and `docs/product-handoff.md`; the shell renders approved IA only; Figma visual gaps are surfaced, not invented; no new architecture is introduced | PASS |
| II | Correctness at the strongest boundary | Tenant isolation = PostgreSQL RLS + `SET LOCAL` + scoped repositories + real-PG tests; outbox atomicity = single transaction; audit append-only = DB privilege; UI is never the correctness boundary | PASS |
| III | Modular monolith, bounded ownership | One `apps/api` deployable; foundation modules (`identity`, `audit`, `platform`) under `apps/api/src/modules/*`; cross-module access via application ports only; dependency-cruiser enforces no cross-module repository/table imports; no domain packages | PASS |
| IV | Multi-tenant, time-safe, money-safe by construction | Multi-tenant spine is the core of Phase 1; Temporal polyfill wired as the domain time type (structure only, no scheduling logic); **no money handling in Phase 1** (Payments is Phase 5) so money rules are N/A but the float-money lint rule is still installed | PASS |
| V | Tests prove behavior, not implementation trivia | ADR-006 layered harness; real PostgreSQL for RLS/constraints/tx/concurrency; Playwright journeys 6 & 7; axe as a gate; no mock-call-order assertions; no weakening tests | PASS |
| VI | Simple architecture over speculative abstraction | Rule of three enforced; **no** `BaseService`, universal/generic repository, single-dependency wrappers, or `common/shared/core/utils/helpers` packages; provider adapters are concrete interfaces with one real + one dev/test implementation, justified by an actual second consumer (tests) | PASS |
| VII | AI agents are contributors, not authorities | This artifact set is the canonical plan; it does not compete with ADRs; any ADR conflict is surfaced in `research.md` and the analysis, never silently changed; no auto-merge; bounded PRs | PASS |
| — | Hard engineering prohibitions (AGENTS.md) | No Tailwind; no float money; no raw `Date` in scheduling code; no tenant query bypassing RLS/scoped repo; no cross-domain repo/table import; no state-changing GET (public offer surface is Phase 4, not here); no check-then-insert overlap (Booking is Phase 2); no provider SDK in domain/UI; no dumping-ground packages; no barrel-file cycle-hiding layers; never weaken tests; no auto-merge | PASS |
| — | Frontend baseline (AGENTS.md) | React + strict TS + Vite SPA; data router; TanStack Query owns server state; workspace-scoped keys `['ws', workspaceId, …]`; cache cleared on switch/logout; Zustand only where justified; SCSS Modules + semantic tokens; motion per `docs/standards/motion.md`; Nova-UI (`@nova-component/ui`) + Nova design tokens (`@nova-component/design-tokens`) consumed per ADR-025; Storybook in `packages/ui` for Slotnova-local stories | PASS |
| — | Backend/data baseline (AGENTS.md) | Node LTS; NestJS + Fastify; PostgreSQL + Drizzle; modular monolith; per-module schema ownership; RLS; exclusion constraints (installed capability; first real use is Booking in Phase 2); transactional outbox + separate Postgres scheduler; OpenAPI generated from runtime boundary schemas; generated client only in `packages/contracts` | PASS |
| — | CI quality gates (`ci-quality-gates.md`) | Strict-TS flag set; fast lane < 3 min target; heavy lane before merge; dependency-cruiser + ESLint + Stylelint token rules; migration gates; deterministic OpenAPI; no auto-merge | PASS |

**Result**: PASS. No violations. **Complexity Tracking table is empty (nothing to justify).**

Re-check after Phase 1 design: see [§Post-Design Constitution Re-Check](#post-design-constitution-re-check).

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation-shell/
├── plan.md              # This file
├── spec.md              # Feature specification (+ Clarifications)
├── research.md          # Phase 0 output — decisions R1–R5 + resolved unknowns
├── data-model.md        # Phase 1 output — foundation entities, RLS model, state
├── contracts/           # Phase 1 output — foundation API contract surface
│   ├── README.md
│   ├── health.contract.md
│   ├── session.contract.md
│   ├── workspace-context.contract.md
│   ├── invitations.contract.md
│   └── problem+json.contract.md
├── quickstart.md        # Phase 1 output — how to validate the foundation end to end
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify + /speckit-clarify)
└── tasks.md             # /speckit-tasks output (separate command)
```

### Source Code (repository root — target layout at Phase 1 exit)

```text
apps/
  web/                        # React + Vite operator SPA
    src/
      app/                    # router, providers, shell composition, auth/workspace bootstrap
        shell/                # desktop + mobile shells, navigation, workspace switcher, account menu
        providers/            # QueryClient (workspace-scoped keys, clear-on-switch), theme, error boundary
        routes/               # route tree; product destinations are placeholder/empty surfaces
      lib/                    # narrow app-wide adapters only (no dumping ground)
      styles/                 # SCSS module conventions, token consumption, theme roots
      test/                   # web test setup, MSW server, a11y helpers
    e2e/                      # Playwright: sign-in smoke, journey 6, journey 7; second-context helper
  api/                        # NestJS + Fastify modular monolith
    src/
      main.ts                 # Fastify bootstrap, security headers, CORS allowlist, session, CSRF
      app.module.ts
      modules/
        identity/             # users, workspaces, locations, memberships, invitations, sessions
          domain/             # value objects, policy functions, invitation rules
          application/        # use cases: sign-in(adapter), accept-invitation, switch-workspace, sign-out
          infrastructure/     # Drizzle schema (identity-owned), tenant-scoped repositories, credential-adapter port
          http/               # controllers, boundary schemas, problem+json mapping
        audit/                # append-only audit write port + Drizzle schema; DB-privilege enforced
        platform/             # tenancy context (SET LOCAL), transactional outbox table + writer, health
      # cross-cutting primitives (branded ids, Result, problem shape) live in the module that
      # first needs them; a primitive is promoted to a package named for its contents (e.g.
      # packages/domain-primitives) ONLY under the rule of three — there is no generic shared area.
      test/                   # Testcontainers harness wiring, RLS-coverage assertion, isolation suite
  worker/                     # outbox consumer loop + scheduled-job runner (selected library)
    src/
      outbox/                 # claim (FOR UPDATE SKIP LOCKED), dispatch, idempotent handlers, DLQ
      scheduler/              # delayed/recurring job registration + runner (graphile-worker | pg-boss)
      test/
packages/
  ui/                         # Nova-UI (`@nova-component/ui`, pinned per ADR-025) consumption + Slotnova-local compositions/system-states + Storybook (Slotnova-local stories only — not a duplicate Nova Storybook)
  design-tokens/              # Nova (`@nova-component/design-tokens`, pinned per ADR-025) token foundation + deterministic Slotnova Figma semantic-alias/override reconciliation layer (ADR-022/ADR-025) — not a duplicate generic token pipeline
  contracts/                  # GENERATED ONLY: OpenAPI doc + client + types + MSW handlers
  db/                         # PostgreSQL client, migration runner, Testcontainers test harness (NOT business tables)
  testing/                    # shared builders/factories/fixtures (no giant shared mutable fixtures)
  observability-browser/      # browser telemetry + error-reporting adapter seam
  observability-server/       # server/worker structured logging, correlation, OTel seam, redaction
  eslint-config/              # shared flat ESLint config incl. import/boundary rules
  tsconfig/                   # shared strict tsconfig bases
tooling/
  dependency-cruiser/         # architecture-boundary ruleset
  stylelint/                  # token/raw-value ruleset
docs/
  adr/…                       # existing; new ADRs only if a Phase 1 decision supersedes one
  decisions/                  # Phase 1 exit decision records R1–R5 (see research.md)
  runbooks/                   # migration release runbook, environment model
.github/workflows/
  fast.yml                    # fast lane
  heavy.yml                   # heavy lane (required before merge)
```

**Structure Decision**: Multi-package pnpm + Turborepo monorepo exactly as ADR-002 / `docs/architecture/overview.md` specify. Deployables in `apps/`, genuinely-shared tooling in `packages/`, architecture-enforcement config in `tooling/`. Backend bounded contexts are **modules inside `apps/api/src/modules/*`**, never packages. `packages/observability-*` is split browser/server per the overview (issue #2's singular "packages/observability" is reconciled to the two-package split the ADR/overview mandate — noted in `research.md`). No `common`/`core`/`shared`/`utils` package and **no `shared-kernel` area**: cross-cutting primitives (branded ids, a `Result` type, the `problem+json` shape) are defined in the module that first needs them and are promoted to a package named for its contents (e.g. `packages/domain-primitives`) only under the rule of three.

**Sequencing note (post-analysis remediation)**:
- The `tooling/dependency-cruiser/` **core** boundary ruleset (UI↛db/infra, domain↛provider SDK, module↛module repo/schema, no cycles, observability-server↛browser, no deep imports) is established in **Phase 1 Setup (PR-01, tasks T005–T006)** so no module is ever built without enforcement — only later rule *tightening* remains for the polish phase.
- The `packages/testing` foundation (fast-check conventions, MSW server + generated-handler wiring, builders/factories, telemetry assertion utils) is its own **Phase 2 PR-04 (tasks T015–T018)** rather than incidental sub-work.
- The **transactional outbox table + transactional writer** is platform infrastructure in **Phase 2 PR-05 (task T022)** — built once. Feature code that emits events (invitation acceptance, T045) and the background worker (T068) both consume it; worker processing, the scheduler, retries/backoff and dead-letter handling stay in **US5 PR-16 (T068–T071)**. There is no forward dependency from a user story into a later user story.
- US2's E2E journeys 6 & 7 run against a **test-only navigation harness (task T048)**, built-excluded from production, so US2 is independently testable without the US3 production shell; task T063 later retargets those journeys onto the real shell.

## Phase 0: Research

See [research.md](./research.md) for full detail. Research tasks:

- **R1 — Managed hosting / PostgreSQL provider** (FR-065): evaluate managed-Postgres + app-hosting options against required capabilities (RLS, `btree_gist`/range/exclusion, transaction-scoped `SET LOCAL` under the provider's pooling model, `timestamptz`, backups, private networking, PITR), operational burden for a small team, and cost. Output: recommendation + rejected alternatives for a founder-approved decision record. **Key risk resolved:** whether the provider's connection pooler preserves per-transaction session config (transaction-mode poolers can break `SET LOCAL` if a transaction spans pooled connections — mitigation: acquire context and do tenant work in the same transaction; verify with the isolation suite against the chosen provider).
- **R2 — Version pins** (FR-066): verify mutual compatibility of Node LTS patch, pnpm, Turborepo, React/Vite/React Router, NestJS/Fastify major, Drizzle/PostgreSQL, Vitest/Playwright/Storybook/Testcontainers, Temporal polyfill, and the selected scheduler + contract-integration libraries. Output: exact pinned versions + lockfile policy.
- **R3 — Job scheduler** (FR-067): graphile-worker vs pg-boss on API/Nest/PostgreSQL fit, delayed + cron support, retry/backoff/DLQ semantics, `SKIP LOCKED` claiming, maintenance/security posture, operational complexity, and coexistence with the outbox (separate tables/ownership). Output: selection + integration shape for `apps/worker`.
- **R4 — Validation → contract integration** (FR-068): from ADR-013's accepted candidate set, choose the runtime-schema→OpenAPI approach that avoids duplicated contract declarations (single boundary schema is the source of OpenAPI + client + MSW). Evaluate Nest integration ergonomics, Zod version fit, determinism of generation, and `problem+json` support. Output: selection + generation pipeline definition for `packages/contracts`.
- **R5 — Production identity provider (conditional)** (FR-033e/FR-069a): only if a production credential provider is required before Phase 1 exit. Evaluate options that plug into the ADR-007 adapter without changing the Slotnova-owned session/authz model. Output: either a selection record or an explicit "not required for exit" note.
- **R6 — CSRF strategy** (closes Phase 0 review gap on ADR-007): choose the anti-CSRF mechanism for cookie-authenticated state-changing requests (double-submit token vs synchronizer token vs strict `Origin`/`Sec-Fetch` checks), compatible with the SPA and `SameSite=Lax`. Output: mechanism + where it is enforced (Fastify plugin at the boundary).
- **R7 — Session storage & rotation**: server-side session record in PostgreSQL (revocable, rot-on-privilege-change) vs signed stateless cookie. ADR-007 requires server-side revocation, so a session table is the default; confirm and define rotation triggers.
- **R8 — Design-token pipeline mechanics** (ADR-022, amended by ADR-025): pin the reviewed `@nova-component/design-tokens` version; Figma Variables export → normalized JSON → deterministic Slotnova semantic alias/override reconciliation (Style Dictionary or equivalent) layered over the Nova token foundation → CSS custom properties in `packages/design-tokens`; determinism, review workflow, and the interim-token fallback if Figma Variable access is unavailable during the task.
- **R9 — Environment & migration release model** (ADR-020): concrete shape of local/preview-CI/staging/production, the gated migration step (separate CI job / release action, never app-startup), and the expand→migrate→contract checklist for migration PRs.

**Output**: `research.md` with Decision / Rationale / Alternatives for R1–R9; all NEEDS CLARIFICATION either resolved or explicitly bounded as a founder decision record with a stated recommendation.

## Phase 1: Design & Contracts

- **[data-model.md](./data-model.md)** — foundation entities (User, Workspace, Location, Membership, Invitation, Session, AuditRecord, OutboxRecord, ScheduledJob), their fields, relationships, uniqueness/identity rules, tenant-ownership + RLS matrix, `SET LOCAL` context contract, invitation and session state transitions, and the "no product entity" guard.
- **[contracts/](./contracts/)** — the Phase 1 API contract surface only: `GET /healthz` / `GET /readyz`; `POST /auth/session` (sign in via credential adapter), `DELETE /auth/session` (sign out), `POST /auth/session/workspace` (switch active workspace); `GET /me` (session + workspace context); `POST /invitations`, `POST /invitations/{token}/acceptance`; and the shared `application/problem+json` shape. Each contract is described as request/response boundary shapes + status/error semantics — **not** implementation. Generated OpenAPI/client artifacts live in `packages/contracts` at implementation time.
- **[quickstart.md](./quickstart.md)** — how to validate the foundation end to end: bootstrap commands, run all three apps, run the fast lane, run the real-PostgreSQL isolation suite, run Playwright journeys 6 & 7, regenerate + drift-check the contract, exercise the outbox crash/restart test, and confirm the exit-decision records exist.

### Post-Design Constitution Re-Check

After drafting `data-model.md` and `contracts/`:

- **Modular boundaries** — foundation modules (`identity`, `audit`, `platform`) expose application ports only; `data-model.md` assigns each table to exactly one module; no shared business schema. **PASS**
- **Tenancy** — every tenant-owned table in `data-model.md` carries `workspace_id`, has an RLS policy row in the matrix, and is covered by the isolation suite; `User` and top-level `Workspace` rows are the only non-workspace-scoped identity tables and are handled by narrowly-reviewed platform access. **PASS**
- **No speculative abstraction** — contracts introduce no generic envelope beyond `problem+json`; the credential adapter has two real implementations (dev + production-shaped test double, plus a real provider later), satisfying the rule of three by need. **PASS**
- **API contract direction** — boundary schemas are the single source; `packages/contracts` is generated-only; no backend entity crosses to the frontend. **PASS**
- **Time/money** — no scheduling or money logic in the contract surface; `Location` carries an IANA zone id as data only. **PASS**

**Result**: PASS — no new violations introduced by the design. Complexity Tracking remains empty.

## Complexity Tracking

*No constitution violations to justify. Table intentionally empty.*

## Phase 1 exit decisions — ownership

| ID | Decision | Spec ref | Owner artifact | Blocking for Phase 1 exit? |
|----|----------|----------|----------------|----------------------------|
| R1 | Managed hosting / PostgreSQL provider | FR-065 | `docs/decisions/0001-hosting-postgres-provider.md` | Yes |
| R2 | Exact version pins | FR-066 | `docs/decisions/0002-version-pins.md` | Yes |
| R3 | graphile-worker vs pg-boss | FR-067 | `docs/decisions/0003-job-scheduler.md` | Yes |
| R4 | Validation → OpenAPI integration | FR-068 | `docs/decisions/0004-validation-contract-integration.md` | Yes |
| R5 | Production identity provider | FR-033e / FR-069a | `docs/decisions/0005-production-identity-provider.md` **or** exit-checklist note | Only if a production credential provider is needed before exit |
| R6 | CSRF mechanism | ADR-007 gap | `docs/decisions/0006-csrf-mechanism.md` (or fold into an ADR-007 amendment) | Yes |
| CI-1 | Heavy-lane pre-merge time budget (agreed after the baseline is observed) | SC-002 | `docs/standards/ci-quality-gates.md` (budget recorded) + `docs/runbooks/perf-baselines.md` (baseline) — task T089 | Yes |
| FE-1 | Client-only-state justification note (only if Zustand is used) | FR-014 | `docs/decisions/0007-client-only-state.md` | Only if Zustand is introduced |

Any decision that diverges from an accepted ADR is recorded with an explicit ADR supersede/amend proposal (FR-069), never applied silently.

## Progress

- [x] Feature spec loaded and clarified
- [x] Technical Context filled; unknowns isolated as R1–R9
- [x] Constitution Check — PASS (pre-design)
- [x] Phase 0 research plan defined → `research.md`
- [x] Phase 1 design artifacts → `data-model.md`, `contracts/`, `quickstart.md`
- [x] Post-Design Constitution Re-Check — PASS
- [x] `/speckit-tasks` — bounded task/PR breakdown → `tasks.md` (91 tasks, 21 PRs)
- [x] `/speckit-analyze` — cross-artifact consistency (0 CRITICAL); F1–F4 remediation applied and re-analyzed; final cleanup applied F7 (SC-002 heavy-lane baseline+budget), N4 (outbox writer moved to Phase 2 T022 — no forward deps), and LOW items F6/F8/F9/F10/F11/F12
- [ ] Founder review of plan + exit-decision ownership
