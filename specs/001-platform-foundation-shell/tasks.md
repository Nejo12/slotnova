---
description: "Phase 1 platform-foundation task list"
---

# Tasks: Phase 1 — Platform Foundation & Shell

**Input**: Design documents in `specs/001-platform-foundation-shell/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Tests**: **INCLUDED.** The spec makes the layered test harness a first-class deliverable (US1, US5, FR-047–FR-052) and the constitution requires invariant coverage at the lowest trustworthy layer. Test tasks are written before or alongside their implementation task and must fail first.

**Scope guard**: every task is platform/foundation only. No Booking/Scheduling/Catalog/Recovery/Payments/Messaging/Notifications/Staff/Inventory/Marketing/Analytics behavior (FR-070). A task that seems to need product behavior is mis-scoped — stop and re-scope.

**Authority**: `.specify/memory/constitution.md` + accepted ADR-001…ADR-025. A task that conflicts with an accepted ADR is surfaced (in the PR and `/speckit-analyze`), never silently resolved.

**Task IDs**: one monotonic sequence `T001…T091`, no suffixes. IDs are execution-order hints; true ordering is the Dependencies section + the Bounded PR sequence. **No forward dependencies** — every `Dep` points to a lower-numbered task.

## Task detail convention

Each task carries a compact block:
- **Dep**: prerequisite task IDs / external decisions
- **Files**: expected files/areas (this is the authoritative file-path list for the task)
- **Accept**: acceptance criteria (maps to FR/SC)
- **Tests**: required tests
- **Constraints**: architecture rules that bind this task
- **Out**: explicitly out of scope for this task

---

## Phase 1: Setup — Monorepo, toolchain & architecture enforcement  ·  **PR-01**

**Purpose**: a clean checkout installs, builds, type-checks, lints **and cannot violate architecture boundaries**. Architecture enforcement is established here so no module is ever built without it.

- [ ] T001 Initialize pnpm workspace + Turborepo at repo root
  - **Dep**: R2 baseline (exact pins may trail; use baseline majors)
  - **Files**: `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (`packageManager` pinned), `.nvmrc`, `.npmrc`
  - **Accept**: `pnpm install` succeeds cold; `turbo run build` graph resolves; FR-001
  - **Tests**: CI job proves a cold install
  - **Constraints**: ADR-002; deployables in `apps/`, shared tooling in `packages/`; no domain packages (FR-003)
  - **Out**: any app/package contents

- [ ] T002 [P] Create shared TypeScript config package
  - **Dep**: T001
  - **Files**: `packages/tsconfig/` (base with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`); per-target extends
  - **Accept**: every workspace unit extends a shared base; FR-004, `docs/standards/ci-quality-gates.md`
  - **Tests**: CI typecheck job
  - **Constraints**: relaxation of any flag requires PR justification
  - **Out**: app-specific compiler options beyond the shared bases

- [ ] T003 [P] Create shared ESLint flat-config package
  - **Dep**: T001
  - **Files**: `packages/eslint-config/` (base, react, node); `import/no-cycle`, no-deep-import rules, no convenience `eslint-disable`
  - **Accept**: `pnpm lint` runs across the workspace; FR-006
  - **Tests**: CI lint job
  - **Constraints**: no rule disables that create escape hatches
  - **Out**: cross-package dependency graph rules (that is dependency-cruiser, T005)

- [ ] T004 [P] Configure formatter + Stylelint skeleton
  - **Dep**: T001
  - **Files**: root Prettier config, `tooling/stylelint/` (raw-color + raw-motion-value ban scaffold, disabled until tokens exist)
  - **Accept**: `pnpm format:check` + `pnpm lint:styles` run; FR-005
  - **Tests**: CI job
  - **Constraints**: Stylelint token rules finalized in T053
  - **Out**: token-layer allowlist (needs `packages/design-tokens`)

- [ ] T005 [P] Dependency-cruiser **core** architecture-boundary ruleset
  - **Dep**: T001, T003
  - **Files**: `tooling/dependency-cruiser/.dependency-cruiser.cjs`, `pnpm lint:boundaries`
  - **Accept**: the ruleset fails the build on, at minimum:
    - UI / `apps/web` / `packages/ui` importing database or server-infrastructure code
    - domain/application code importing a provider SDK
    - one backend module importing another backend module's repository or schema
    - any circular dependency
    - `packages/observability-server` (or any server-only observability code) imported into browser bundles / `apps/web` / `packages/observability-browser`
    - deep imports that bypass a module's or package's public entry point
  - Rules are **path-pattern based on the intended structure** (plan.md Project Structure) and in place before modules exist; FR-006, SC-005, `docs/standards/ci-quality-gates.md`
  - **Tests**: T006
  - **Constraints**: real import-graph rules, not directory-name heuristics alone; must run in the fast lane
  - **Out**: later rule *tightening* / additional narrow rules (T085)

- [ ] T006 [P] Boundary-rule fixture tests
  - **Dep**: T005
  - **Files**: `tooling/dependency-cruiser/__fixtures__/*` (one deliberately-violating fixture per core rule), `tooling/dependency-cruiser/__tests__/rules.test.ts`
  - **Accept**: each core rule has a fixture that fails `pnpm lint:boundaries`; a compliant fixture passes; SC-005
  - **Tests**: this is the test task
  - **Constraints**: fixtures are inert (never imported by real code)
  - **Out**: n/a

- [ ] T007 GitHub Actions fast-lane workflow
  - **Dep**: T002–T006
  - **Files**: `.github/workflows/fast.yml` (format, ESLint, Stylelint, dependency-cruiser boundaries, typecheck, unit/property tests, changed-package component tests, build/type-generation smoke), Turborepo remote cache wiring
  - **Accept**: fast lane green on the bootstrap; targets < 3 min on warm cache; boundary violations fail here; FR-007, FR-008, SC-002, SC-005
  - **Tests**: the workflow itself; a fixture PR (type error + raw hex + cross-module import) fails naming each
  - **Constraints**: no auto-merge; required-checks config; FR-009; heavy tests never bypassed for slowness
  - **Out**: heavy lane (T087)

- [ ] T008 [P] `README` bootstrap section + `docs/runbooks/local-dev.md`
  - **Dep**: T001
  - **Files**: repo `README.md` (Phase 1 quickstart commands), `docs/runbooks/local-dev.md`
  - **Accept**: a contributor reaches running apps in < 30 min following only docs; SC-001
  - **Tests**: manual dry-run by a second person, recorded in the PR
  - **Constraints**: commands must match actual scripts
  - **Out**: deployment runbook (T075)

**Checkpoint**: `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm lint:boundaries` all green on a cold clone; a cross-module import fails CI.

---

## Phase 2: Foundational — DB harness, observability seams, testing foundation, API + outbox infrastructure  ·  **PR-02, PR-03, PR-04, PR-05**

**Purpose**: blocking prerequisites for every user story. No story work starts until this is done.

### PR-02 — `packages/db`: client, migration runner, real-PostgreSQL harness

- [ ] T009 Implement PostgreSQL client factory in `packages/db`
  - **Dep**: T001; R1 direction (adapter-neutral)
  - **Files**: `packages/db/src/client.ts` (pool config, RLS-subject app role vs migration role), `packages/db/src/index.ts` (public entry only)
  - **Accept**: connects with an RLS-subject role (never `BYPASSRLS`); provider-neutral config; ADR-004, data-model "Tenant context contract"
  - **Tests**: T011
  - **Constraints**: `packages/db` owns **no** business tables (ADR-004); no barrel that hides cycles
  - **Out**: any module schema

- [ ] T010 Implement gated migration runner + `schema_migrations`
  - **Dep**: T009
  - **Files**: `packages/db/src/migrate.ts`, `packages/db/migrations/` convention, `pnpm db:migrate` (standalone; never app-startup). **`packages/db` owns `schema_migrations`** (migration-runner bookkeeping); no module owns it.
  - **Accept**: migrations run as an explicit step; clean-DB apply works; FR-060, US6
  - **Tests**: T012
  - **Constraints**: reviewed SQL migration files; no `drizzle-kit push` in staging/prod; ADR-020
  - **Out**: expand/contract PR checklist automation (T074)

- [ ] T011 [P] Testcontainers real-PostgreSQL harness in `packages/db`
  - **Dep**: T009
  - **Files**: `packages/db/src/testing/pg-container.ts`, transaction-rollback helper, isolated-schema helper for commit-required tests
  - **Accept**: tests spin a real PostgreSQL container; `btree_gist` installable; ADR-006 layer 5, FR-048
  - **Tests**: a self-test that starts a container and runs a trivial query
  - **Constraints**: no mocks for DB behavior; concurrency helpers use independent connections (FR-046)
  - **Out**: the isolation suite itself (T040)

- [ ] T012 [P] Migration test utilities (clean + forward-from-populated) + RLS-coverage assertion
  - **Dep**: T010, T011
  - **Files**: `packages/db/src/testing/migrate-assertions.ts`, RLS-coverage assertion helper (every tenant-owned table has RLS enabled + FORCE + policy)
  - **Accept**: helpers assert clean-DB apply and forward apply; RLS-coverage assertion reusable by module tests; FR-063, SC-003, SC-011
  - **Tests**: helper self-tests
  - **Constraints**: helper is generic; module-specific expectations live with the module
  - **Out**: identity migrations (T030)

### PR-03 — Observability seams + correlation (server & browser)

- [ ] T013 [P] `packages/observability-server`: structured logging + correlation context + redaction
  - **Dep**: T001
  - **Files**: `packages/observability-server/src/logger.ts` (structured JSON, stable event names), `als-context.ts` (AsyncLocalStorage correlation), `redaction.ts` (sensitive-field denylist)
  - **Accept**: structured records only; correlation id in every line; redaction drops configured fields; FR-053, FR-054, FR-057
  - **Tests**: T078
  - **Constraints**: not the audit trail; vendor exporters are adapters (FR-055); no high-cardinality metric labels (FR-056); blocked from browser bundles by T005
  - **Out**: OTel exporter config for a specific vendor

- [ ] T014 [P] `packages/observability-browser`: error-reporting adapter seam
  - **Dep**: T001
  - **Files**: `packages/observability-browser/src/error-reporter.ts` (provider-neutral), release/env context
  - **Accept**: error reporting behind an adapter with release/env context; FR-058
  - **Tests**: unit test with a fake sink
  - **Constraints**: **must not** be importable from server code and vice versa (enforced by T005)
  - **Out**: real provider DSN wiring (env-config task T072)

### PR-04 — Testing foundation

- [ ] T015 [P] fast-check setup + property-test conventions
  - **Dep**: T001
  - **Files**: `packages/testing/src/property/` (arbitraries scaffold), `docs/testing/property-testing-conventions.md`, Vitest wiring for fast-check
  - **Accept**: property tests runnable in the fast lane; conventions doc covers property vs example test choice (DST/interval/allocation/illegal-transition per `docs/testing/strategy.md` §2); FR-047
  - **Tests**: a sample property test that runs green
  - **Constraints**: no arbitrary sleeps; deterministic seeds recorded on failure
  - **Out**: domain-specific arbitraries (arrive with product phases)

- [ ] T016 [P] MSW server + generated-contract handler wiring
  - **Dep**: T001
  - **Files**: `packages/testing/src/msw/` (node server for tests, browser worker for Storybook/dev), convention to consume handlers generated into `packages/contracts` (once T065 exists)
  - **Accept**: component tests and Storybook edge states use shared handlers; MSW never used as evidence for DB correctness; FR-047, FR-048, `docs/testing/strategy.md` §4
  - **Tests**: a sample component test using an MSW handler
  - **Constraints**: ordinary CI makes no real external-provider calls (FR-049)
  - **Out**: generated handlers themselves (T065)

- [ ] T017 [P] `packages/testing` builders / factories / fixtures
  - **Dep**: T001
  - **Files**: `packages/testing/src/builders/` (workspace, user, membership, session, invitation builders), `packages/testing/src/index.ts`
  - **Accept**: builders/factories used instead of giant shared mutable fixtures; FR-047, `docs/testing/strategy.md` test-quality rules
  - **Tests**: builder self-tests
  - **Constraints**: builders produce valid-by-default entities with override hooks; no cross-module coupling
  - **Out**: product-entity builders

- [ ] T018 [P] Telemetry / domain-event test-assertion utilities
  - **Dep**: T013, T017
  - **Files**: `packages/testing/src/telemetry.ts` (in-memory event sink + assertions)
  - **Accept**: tests assert emitted domain/telemetry events with no network; FR-055, US7 independent test
  - **Tests**: self-test
  - **Constraints**: no hosted vendor required locally/CI
  - **Out**: metrics dashboards

### PR-05 — `apps/api` NestJS + Fastify bootstrap + transactional outbox infrastructure

- [ ] T019 Bootstrap NestJS + Fastify app with security middleware
  - **Dep**: T001, T013
  - **Files**: `apps/api/src/main.ts`, `app.module.ts`; Fastify adapter, security headers (CSP, HSTS, etc.), strict CORS allowlist, request-id/correlation middleware
  - **Accept**: app starts; correlation middleware active; security headers present; ADR-004, `docs/security/security-and-audit.md`
  - **Tests**: T023 (health), API integration bootstrap test
  - **Constraints**: Fastify pinned to the Nest-adapter-supported major (ADR-004 known risk); no provider SDKs in app code
  - **Out**: session/CSRF (PR-08), auth

- [ ] T020 [P] `application/problem+json` exception filter + shared problem types
  - **Dep**: T019
  - **Files**: `apps/api/src/http/problem/` (filter + shared problem shape from `contracts/problem+json.contract.md`)
  - **Accept**: every error response is RFC 9457 `problem+json` with stable `type`, `instance` = correlation id; FR-037, contract
  - **Tests**: T067 contract tests — forced error on each endpoint validates against the schema
  - **Constraints**: `detail` never leaks stack/SQL/PII; 5xx uses generic `type`
  - **Out**: per-endpoint problem slugs beyond the Phase 1 catalogue

- [ ] T021 Tenancy context primitive — `SET LOCAL` transaction wrapper
  - **Dep**: T009, T019
  - **Files**: `apps/api/src/modules/platform/tenancy/with-workspace-context.ts` (opens tx, `SET LOCAL app.workspace_id/app.user_id/app.request_id`, runs callback), Nest provider
  - **Accept**: tenant work runs only inside a context tx; context + queries share one transaction (pooler-safe per R1); FR-028, data-model contract
  - **Tests**: T040 depends on this; unit test that a tenant query without context fails closed
  - **Constraints**: app role is RLS-subject; no unscoped tenant query API exists (FR-030); no cross-module import
  - **Out**: the identity repositories that use it (PR-08)

- [ ] T022 Transactional outbox infrastructure — table, migration & transactional writer
  - **Dep**: T010, T012, T021
  - **Files**: `packages/db/migrations/00xx_outbox.sql` (`outbox_records` per `data-model.md`), `apps/api/src/modules/platform/outbox/{schema.ts,writer.ts}` (write an outbox row **in the same transaction** as a business state change), `docs/architecture/event-catalogue.md` (ADR-024, initial catalogue)
  - **Accept**: a business write + its outbox row commit or roll back together (rollback hides both); payload versioned + PII-minimized + carries `request_id`; FR-040, FR-045, ADR-005/024. This is the **minimal platform outbox persistence/writer** that later features (invitation acceptance, T045) depend on.
  - **Tests**: T024 — writer atomicity test (real PostgreSQL): commit visibility, rollback hides both rows
  - **Constraints**: the outbox is **not** the job scheduler and has **no** delivery/retry/DLQ logic here — that is worker/scheduler work (PR-16); separate table, separate ownership (ADR-005/014); do not duplicate this writer anywhere
  - **Out**: consumer loop, dispatch, retries/backoff, dead-letter, scheduler (all T068–T071)

- [ ] T023 [P] Health & readiness endpoints
  - **Dep**: T019, T010, T022
  - **Files**: `apps/api/src/modules/platform/health/` (controller + boundary schemas), `GET /healthz`, `GET /readyz` (db + migrations-current + outbox-reachable checks)
  - **Accept**: matches `contracts/health.contract.md`; `readyz` → 503 `problem+json` when DB down; FR-039
  - **Tests**: T067 contract test; integration test with DB stopped
  - **Constraints**: no DB access in `/healthz`; no state change
  - **Out**: outbox lag/queue metrics (T077)

- [ ] T024 [P] Outbox writer atomicity test (real PostgreSQL)
  - **Dep**: T022
  - **Files**: `apps/api/src/modules/platform/outbox/__tests__/writer.int.test.ts`
  - **Accept**: business write + outbox row are atomic — a rolled-back transaction leaves neither visible; a committed one leaves both; SC-009 (writer half)
  - **Tests**: this is the test task
  - **Constraints**: Testcontainers; no mocks
  - **Out**: at-least-once / crash-restart / idempotency (T070 — consumer half)

**Checkpoint**: API boots, `/healthz` 200, `/readyz` reflects real DB + outbox state, all errors are `problem+json`, correlation ids flow, the transactional outbox writer is available to feature code, real-PG + property + MSW + builder harness all work, boundaries enforced.

---

## Phase 3: User Story 1 — Clean-checkout onboarding & enforcing CI (P1) 🎯 MVP  ·  **PR-06**

**Goal**: clone → install/build/typecheck/lint/boundaries/test → run all three apps; CI blocks type errors, style violations and architecture-boundary violations.

**Independent Test**: cold clone runs the documented command set green; a PR with a deliberate type error + raw hex + cross-module import fails the fast lane naming each; unchanged packages are cache-reused.

- [ ] T025 [US1] Add `apps/web` + `apps/worker` minimal runnable skeletons
  - **Dep**: T001, T019
  - **Files**: `apps/web/` (Vite app that renders "Slotnova" + a health ping), `apps/worker/` (a no-op loop that logs a structured startup line)
  - **Accept**: `pnpm dev:web` / `dev:api` / `dev:worker` all start; SC-001 step 2
  - **Tests**: smoke test per app (process starts, emits ready)
  - **Constraints**: skeletons only; no product routes/handlers
  - **Out**: shell (PR-14), outbox consumer loop (PR-16)

- [ ] T026 [US1] Root task scripts + Turborepo pipeline definitions
  - **Dep**: T001, T025
  - **Files**: root `package.json` scripts (`build`, `typecheck`, `lint`, `lint:boundaries`, `lint:styles`, `test`, `dev:*`, `contracts:*`, `db:*`, `e2e`, `test:a11y`), `turbo.json` task graph + cache inputs/outputs
  - **Accept**: every quickstart command exists and is wired; caching reuses unchanged packages; FR-008
  - **Tests**: CI proves a second run is cache-served for untouched packages
  - **Constraints**: deterministic task inputs
  - **Out**: n/a

- [ ] T027 [P] [US1] Fast-lane hardening — all gate categories + timing budget
  - **Dep**: T007, T005, T026
  - **Files**: `.github/workflows/fast.yml` (add changed-package component tests, confirm dependency-cruiser + stylelint + property tests run), timing report
  - **Accept**: fast lane runs all gate categories; < 3 min warm; FR-007, SC-002
  - **Tests**: fixture PR — type error, raw hex, cross-module import — fast lane fails naming each (SC-005)
  - **Constraints**: gates fail closed; no skip-on-slow
  - **Out**: heavy lane

- [ ] T028 [P] [US1] Contributor onboarding verification + CODEOWNERS / merge policy
  - **Dep**: T008
  - **Files**: `docs/runbooks/local-dev.md` (final), `.github/CODEOWNERS`, branch-protection notes, PR template check for "no product behavior"
  - **Accept**: no auto-merge; founder is final merger; FR-009, SC-015
  - **Tests**: manual second-person run recorded in PR
  - **Constraints**: matches `AGENTS.md` PR rules
  - **Out**: n/a

**Checkpoint (MVP)**: reproducible, CI-enforced workspace with three runnable skeleton apps and live architecture enforcement. Stop and validate.

---

## Phase 4: User Story 2 — Secure, tenant-isolated operator session (P1)  ·  **PR-07 … PR-11**

**Goal**: full Slotnova-owned session/authz/RLS spine + invitation/membership acceptance + sign-out + workspace switch; workspace A cannot touch workspace B; permission checks are server-side. Credentials behind the ADR-007 adapter.

**Independent Test**: quickstart §4/§5/§10 — isolation suite green, invitation flow green, E2E journeys 6 & 7 green **against the test-only navigation harness**, dev vs production-shaped adapter parity proven. US2 is fully demoable without the US3 production shell.

### PR-07 — Identity + audit schema, RLS migrations

- [x] T029 [P] [US2] `identity` module scaffold + Drizzle schema (users, workspaces, locations)
  - **Dep**: T009, T021
  - **Files**: `apps/api/src/modules/identity/infrastructure/schema/{user,workspace,location}.ts`, module `index.ts` (ports only)
  - **Accept**: schema matches `data-model.md`; branded ids; IANA-zone validation on `locations.timezone` (data only); ADR-010
  - **Tests**: T033
  - **Constraints**: per-module schema ownership (ADR-004); no cross-module import
  - **Out**: memberships/invitations/sessions (T030)

- [x] T030 [P] [US2] `identity` schema: memberships, invitations, sessions
  - **Dep**: T029
  - **Files**: `apps/api/src/modules/identity/infrastructure/schema/{membership,invitation,session}.ts`
  - **Accept**: unique `(workspace_id,user_id)` membership; partial-unique pending invitation per `(workspace_id,email)`; token stored hashed; session fields per `data-model.md`
  - **Tests**: T033
  - **Constraints**: `sessions` keyed by user (no RLS); `memberships`/`invitations` tenant-owned
  - **Out**: repositories (T034)

- [x] T031 [US2] Identity + audit migrations with RLS enable/FORCE + policies
  - **Dep**: T029, T030, T010, T012
  - **Files**: `packages/db/migrations/00xx_identity.sql`, `00xx_audit.sql` (RLS `ENABLE`+`FORCE` on `locations`,`memberships`,`invitations`,`audit_records`; workspace-predicate policies; audit role grants `INSERT`+`SELECT` only)
  - **Accept**: clean apply + forward apply pass; RLS-coverage assertion passes for 100% tenant-owned tables; FR-024, FR-029, FR-032, SC-003, SC-011
  - **Tests**: T033; T040 depends on this
  - **Constraints**: expand-style additive; reviewed SQL; ADR-008, ADR-020
  - **Out**: product tables

- [x] T032 [P] [US2] `audit` module: append-only write port + schema
  - **Dep**: T031, T021
  - **Files**: `apps/api/src/modules/audit/` (write port `recordAudit(...)`, infra writer)
  - **Accept**: audit rows carry actor/workspace/action/entity/timestamp/request-id; app role cannot UPDATE/DELETE (proven); FR-032
  - **Tests**: T033 — attempt UPDATE/DELETE as app role → denied
  - **Constraints**: other modules call the port, never the table (constitution III)
  - **Out**: audit read UI (roadmap Phase 6)

- [x] T033 [P] [US2] Identity/audit schema + migration + RLS tests (real PostgreSQL)
  - **Dep**: T031, T032
  - **Files**: `apps/api/src/modules/identity/**/__tests__/schema.int.test.ts`, `apps/api/src/modules/audit/**/__tests__/append-only.int.test.ts`
  - **Accept**: migrations clean+forward; RLS coverage; audit immutability; FR-048
  - **Tests**: this is the test task
  - **Constraints**: Testcontainers (T011); no mocks for DB behavior
  - **Out**: cross-tenant behavioral suite (T040)

### PR-08 — Session spine, credential adapter, CSRF, sign-in/out, `/me`

- [x] T034 [US2] Tenant-scoped identity repositories
  - **Dep**: T030, T021
  - **Files**: `apps/api/src/modules/identity/infrastructure/repositories/*.ts` (workspace-scoped by construction — require a context object)
  - **Accept**: no unscoped `find()` on tenant data; users/workspaces via a narrowly-reviewed platform-scoped repo; FR-030
  - **Tests**: T040
  - **Constraints**: repositories never exported outside the module
  - **Out**: n/a

- [x] T035 [US2] Credential adapter port + development credential adapter
  - **Dep**: T029; R5 (port shape)
  - **Files**: `apps/api/src/modules/identity/infrastructure/credential-adapter/{port.ts,dev-adapter.ts}`, seeded-user fixtures (via `packages/testing` builders)
  - **Accept**: dev adapter verifies seeded users and returns an `external_ref`/user match; **no** password infra; FR-027, FR-033d
  - **Tests**: T039 (parity)
  - **Constraints**: adapter returns identity only — never issues sessions or authorization; provider role claims ignored (FR-027)
  - **Out**: production provider (conditional R5)

- [x] T036 [US2] Session service: issue / rotate / revoke / validate
  - **Dep**: T034, T035, T013
  - **Files**: `apps/api/src/modules/identity/application/session/*.ts`, opaque cookie mapping (hashed session id)
  - **Accept**: server-authoritative expiry; rotate on sign-in/switch/priv-change; revoke on sign-out; fails closed on invalid; ADR-007, FR-025, FR-033a/c, research R7
  - **Tests**: session-service unit tests in this task's `__tests__/` (issue/rotate/revoke/expiry state machine); end-to-end coverage via T038 and T039
  - **Constraints**: no JWT in `localStorage`; cookie `HttpOnly`/`Secure`/`SameSite=Lax`/`__Host-` where topology permits
  - **Out**: SSO/MFA

- [x] T037 [US2] CSRF protection (double-submit token + Origin/Sec-Fetch check)
  - **Dep**: T019, T036; R6
  - **Files**: `apps/api/src/modules/platform/security/csrf.ts` (Fastify plugin), CSRF-token bootstrap route
  - **Accept**: state-changing cookie-auth requests without/with-bad token → 403 `problem+json`; safe methods exempt & side-effect-free; FR-026, research R6
  - **Tests**: T038 contract cases
  - **Constraints**: no state-changing GET (hard prohibition)
  - **Out**: rate limiting (T073)

- [x] T038 [US2] Sign-in / sign-out / `GET /me` endpoints
  - **Dep**: T036, T037, T020
  - **Files**: `apps/api/src/modules/identity/http/{session.controller.ts,me.controller.ts}` + boundary schemas
  - **Accept**: matches `contracts/session.contract.md` + `contracts/workspace-context.contract.md` (`/me`); auto-selects sole workspace; SC-016 path
  - **Tests**: session + CSRF contract/integration tests in this task's `__tests__/`; T050 sign-in E2E smoke
  - **Constraints**: boundary schemas are the contract source (T064)
  - **Out**: workspace switch (T042), invitations (PR-10)

- [x] T039 [P] [US2] Credential-adapter parity test
  - **Dep**: T035, T036
  - **Files**: `apps/api/src/modules/identity/**/__tests__/adapter-parity.int.test.ts` (same session/context/authz/RLS assertions run against dev adapter + a production-shaped double)
  - **Accept**: identical isolation/authorization outcomes; no path skips workspace context or RLS; FR-033d, SC-016
  - **Tests**: this is the test task
  - **Constraints**: the double is test-only, production-shaped
  - **Out**: real provider

### PR-09 — Authorization policy layer + workspace switch + isolation suites

- [x] T040 [US2] Cross-tenant isolation test suite (real PostgreSQL)
  - **Dep**: T031, T034, T021
  - **Files**: `apps/api/src/test/isolation/*.int.test.ts` (parameterized over every tenant-owned table + every identity data path)
  - **Accept**: workspace-A session cannot read/mutate workspace-B rows even with `workspace_id` filter omitted; RLS coverage asserted; FR-033, SC-004
  - **Tests**: this is the test task
  - **Constraints**: independent connections; no mocks
  - **Out**: concurrency cases (T044)

- [x] T041 [US2] Authorization policy layer (server-authoritative)
  - **Dep**: T034
  - **Files**: `apps/api/src/modules/identity/domain/policy/*.ts` (policy fns over user + active workspace + membership + permissions), Nest guard/decorator
  - **Accept**: protected ops decided server-side; missing capability → 403 `problem+json` with `requiredCapability`; FR-031, ADR-009
  - **Tests**: T043 exhaustive role/permission matrix; T051 E2E journey 7
  - **Constraints**: UI permission state never substitutes for this
  - **Out**: custom roles

- [x] T042 [US2] Workspace select/switch endpoint + cache-clear contract
  - **Dep**: T036, T041, T020
  - **Files**: `apps/api/src/modules/identity/http/workspace-context.controller.ts` + schema; `POST /v1/auth/session/workspace`
  - **Accept**: matches `contracts/workspace-context.contract.md`; rotates session; 403 `not-a-member` with no existence disclosure; 409 on suspended; FR-033c
  - **Tests**: integration in this task's `__tests__/`; T050 E2E journey 6
  - **Constraints**: response signals the web client to clear server-state cache (enforced in T058/T061 for the real shell, and in the test-nav harness T048)
  - **Out**: n/a

- [x] T043 [P] [US2] Authorization matrix tests
  - **Dep**: T041
  - **Files**: `apps/api/src/modules/identity/domain/policy/__tests__/policy.test.ts`, `policy.int.test.ts`
  - **Accept**: every (role × protected-foundation-action) pair asserted allow/deny; ADR-009
  - **Tests**: this is the test task
  - **Constraints**: property/table-driven; not mock-call assertions
  - **Out**: n/a

- [x] T044 [P] [US2] Concurrency isolation tests (independent connections)
  - **Dep**: T040, T042
  - **Files**: `apps/api/src/test/isolation/concurrency.int.test.ts`
  - **Accept**: concurrent sessions in different workspaces never cross-read; `SET LOCAL` context never leaks across pooled connections; FR-046, SC-004
  - **Tests**: this is the test task
  - **Constraints**: genuinely concurrent, synchronized to overlap; no sequential loops
  - **Out**: outbox concurrency (T071)

### PR-10 — Invitation & membership acceptance

- [x] T045 [US2] Invitation issuance + acceptance use cases
  - **Dep**: T034, T041, T032, T022
  - **Files**: `apps/api/src/modules/identity/application/invitation/{issue,accept,revoke}.ts`, high-entropy token gen + hash
  - **Accept**: matches `contracts/invitations.contract.md`; acceptance is one transaction (invitation→accepted + membership create + audit + **outbox write via the T022 platform writer**); expired/used/revoked refused; last-owner rule respected; FR-033b, SC-018
  - **Tests**: T047
  - **Constraints**: token single-use; short server-set TTL; only hash stored; `SET LOCAL` = invitation workspace; uses the existing platform outbox writer (T022) — no new outbox implementation
  - **Out**: real delivery channel (roadmap Phase 3 Notifications)

- [x] T046 [US2] Invitation endpoints (issue / preview / accept / revoke)
  - **Dep**: T045, T020
  - **Files**: `apps/api/src/modules/identity/http/invitations.controller.ts` + boundary schemas (incl. `PATCH /v1/invitations/{id}` revoke)
  - **Accept**: `GET /v1/invitations/{token}` is read-only & prefetch-safe; accept is POST; PII-light preview; matches contract
  - **Tests**: T047 contract + integration
  - **Constraints**: no state change on GET; rate-limited per token/IP
  - **Out**: n/a

- [x] T047 [P] [US2] Invitation flow tests (real PostgreSQL)
  - **Dep**: T046
  - **Files**: `apps/api/src/modules/identity/**/__tests__/invitation.int.test.ts`
  - **Accept**: valid token → exact role membership + audit + outbox, session rotated; expired/used/revoked → refused, no membership change; replay → no second/elevated membership; SC-018
  - **Tests**: this is the test task
  - **Constraints**: Testcontainers
  - **Out**: n/a

### PR-11 — Test-only navigation harness + Playwright harness + journeys 6 & 7

- [x] T048 [US2] Minimal test-only navigation / workspace harness in `apps/web`
  - **Dep**: T025, T038, T042, T046
  - **Files**: `apps/web/src/test-harness/` (gated behind `import.meta.env.VITE_E2E`; **excluded from every production build** — verified by a build-output check and a dependency-cruiser rule in T085), a bare page with: sign-in via dev adapter, a workspace switcher, a list of the active workspace's foundation records (memberships/locations), and an action button that calls a `members:invite`-gated endpoint
  - **Accept**: provides just enough UI for E2E journeys 6 & 7 to run **without** the US3 production shell; FR-051
  - **Tests**: exercised by T050, T051; a build-output assertion that `test-harness` is absent from the production bundle
  - **Constraints**: test-only, flag-gated, absent from production bundle; **not** the production shell; no product behavior
  - **Out**: real navigation IA, theming, a11y polish (all US3)

- [x] T049 [US2] Playwright base harness + second isolated browser context helper
  - **Dep**: T025, T038, T048
  - **Files**: `apps/web/e2e/` config, fixtures (seeded workspaces/users via dev adapter), `secondContext()` helper
  - **Accept**: harness runs headless in CI; can open a second isolated context (needed for Recovery later); FR-051
  - **Tests**: a trivial "load harness + sign in" E2E smoke
  - **Constraints**: no product journeys
  - **Out**: journeys 1–5 (later roadmap phases)

- [x] T050 [P] [US2] E2E journey 6 — workspace-switch data isolation
  - **Dep**: T049, T042, T048
  - **Files**: `apps/web/e2e/journey-06-workspace-switch.spec.ts`
  - **Accept**: after switch A→B via the test-nav harness, no workspace-A record is visible; server-state cache cleared; SC-017
  - **Tests**: this is the test task
  - **Constraints**: asserts no stale query data after switch
  - **Out**: n/a

- [x] T051 [P] [US2] E2E journey 7 — restricted-permission denial
  - **Dep**: T049, T041, T046, T048
  - **Files**: `apps/web/e2e/journey-07-restricted-permission.spec.ts`
  - **Accept**: a `staff`-role user triggering the invite action is denied **server-side** (403), not just a hidden control; SC-017
  - **Tests**: this is the test task
  - **Constraints**: verifies the API call fails, not only UI absence
  - **Out**: n/a

**Checkpoint**: session spine, tenancy, authz, invitations, and journeys 6 & 7 (on the test-nav harness) all green. US2 independently testable and demoable.

---

## Phase 5: User Story 3 — Accessible desktop & mobile shell (P2)  ·  **PR-12, PR-13, PR-14**

**Goal**: shell with approved IA, semantic-token Light/Dark, reduced-motion, system-state components, accessible dialogs; product routes are empty placeholders. The production shell replaces the US2 test-nav harness for real use.

**Independent Test**: quickstart §3 — axe clean on shell nav/switcher/dialogs; keyboard-only reaches every destination; Light/Dark token-driven; reduced-motion degrades; mobile nav is exactly `Home · Calendar · Clients · Recovery · More`.

### PR-12 — Nova token foundation + Slotnova theme/semantic reconciliation layer

- [x] T052 [P] [US3] Nova design-token foundation + Slotnova Figma semantic-alias/override reconciliation (`packages/design-tokens`)
  - **Dep**: T001; R8; ADR-025
  - **Files**: `packages/design-tokens/` (pin the reviewed `@nova-component/design-tokens` version; normalized Slotnova Figma-variable export; deterministic Slotnova semantic alias/override generation layered over the Nova token foundation — Style Dictionary or equivalent for the reconciliation step only; CSS custom-property + TS output), `pnpm tokens:generate`
  - **Accept**: pins a reviewed `@nova-component/design-tokens` version; deterministic (byte-identical on unchanged input); Slotnova semantic aliases/overrides (incl. `Recovery/*` and `Appointment/*` semantics) reconcile the approved Figma variables against the Nova foundation rather than replacing it; covers color/typography/spacing/radius/elevation/motion; semantic names (no `radius-12px`); **no duplicate generic Nova token implementation**; ADR-022, ADR-025, FR-016, FR-022, SC-007
  - **Tests**: T054
  - **Constraints**: generated artifacts reviewed, never hand-edited; interim token set flagged `INTERIM — reconcile` if Figma Variables unavailable; reuse a Nova value as-is wherever it faithfully matches approved Figma — do not re-author it locally
  - **Out**: per-component overrides; a standalone/duplicate Nova-equivalent token pipeline

- [x] T053 [P] [US3] Finalize Stylelint rules for the combined Nova + Slotnova token/theme layer
  - **Dep**: T052, T004
  - **Files**: `tooling/stylelint/` (ban raw colors + raw motion durations/easings outside the designated Nova-consuming + Slotnova-reconciled token/theme layer in `packages/design-tokens`, documented exceptions)
  - **Accept**: raw hex in a component SCSS module fails lint; SC-007
  - **Tests**: fixture test
  - **Constraints**: Light/Dark stays semantic-token driven
  - **Out**: n/a

- [x] T054 [P] [US3] Token pipeline determinism + Light/Dark completeness + Slotnova semantic-mapping verification
  - **Dep**: T052
  - **Files**: `packages/design-tokens/src/__tests__/generate.test.ts` (nested under `src/` to match this repo's established per-package test convention, not the literal path above)
  - **Accept**: regeneration identical; Light & Dark both resolve every semantic token; every Slotnova Figma semantic (incl. `Recovery/*`, `Appointment/*`) resolves through an alias/override to a Nova or Slotnova-owned token with no unresolved alias; ADR-022, ADR-025
  - **Tests**: this is the test task
  - **Out**: n/a

### PR-13 — Nova-UI consumer foundation + Slotnova composition layer + proven gaps only

- [x] T055 [US3] Consume `@nova-component/ui`; Slotnova composition layer (`packages/ui`) + Storybook for Slotnova-local stories only
  - **Dep**: T052; ADR-025
  - **Files**: `packages/ui/` (pin the reviewed `@nova-component/ui` version; consume Nova primitives Slotnova needs — Button, TextInput, Textarea, Badge, Select, Checkbox, Radio, Dialog, Toast, InlineAlert, Skeleton, Progress, Popover, Menu, Tooltip, Card, EmptyState, FormField — rather than recreating them), `packages/ui/.storybook/` (Slotnova-local stories only; no duplicate Nova Storybook)
  - **Accept**: consumes Nova primitives rather than recreating them; no domain logic; product-specific compositions (Metric Card, Appointment Block, product navigation composition, Recovery cards) stay local to their consuming app/module, never in this shared package; FR-021, ADR-025, AGENTS frontend baseline
  - **Tests**: T057 component/a11y tests
  - **Constraints**: no import of domain services (enforced by T005); no barrel that hides cycles; no copying Nova source into this repo; no local `link:`/workspace linkage to `Nejo12/nova-ui`; a genuine generic-primitive gap (e.g. Toggle, Date Picker, Time Picker, Drawer, Icon Button, Avatar, Segmented control) is tracked as a separate Nova-UI issue with evidence, never copied or implemented here
  - **Out**: product components; reimplementing any primitive Nova already publishes

- [x] T056 [US3] System-state components (empty/loading/no-results/error/offline/success/destructive-confirm/permission-restricted/partial-stale)
  - **Dep**: T055
  - **Files**: `packages/ui/src/system-states/` (composed over consumed Nova primitives + Slotnova tokens), Storybook stories per state in Light + Dark
  - **Accept**: shared presentation; status never color-only; safe exit preserved; composed from Nova primitives where they fit rather than reimplemented; FR-018
  - **Tests**: T057; visual-regression stories (T088)
  - **Constraints**: motion per `docs/standards/motion.md`
  - **Out**: wiring into product routes

- [x] T057 [P] [US3] Component + accessibility compatibility tests for consumed Nova primitives + Slotnova compositions
  - **Dep**: T055, T056
  - **Files**: `packages/ui/src/**/__tests__/*.test.tsx`
  - **Accept**: keyboard semantics; dialog/drawer focus trap + Escape + focus restore; axe clean; verifies consumed Nova primitives render and behave correctly under the Slotnova theme; FR-019, ADR-006 layer 3/9
  - **Tests**: this is the test task
  - **Constraints**: behavior not implementation detail; no exact-timing assertions; no tests of Nova's own internal implementation — only the Slotnova consumption/theme contract
  - **Out**: n/a

### PR-14 — `apps/web` shell

- [x] T058 [US3] Router + providers (QueryClient workspace-scoped, theme, error boundary)
  - **Dep**: T025, T052, T038, T014
  - **Files**: `apps/web/src/app/{router.tsx,providers/*}` — `createBrowserRouter`, `QueryClientProvider` with key factory `['ws', workspaceId, ...]`, clear-on-logout/switch, theme provider, root error boundary
  - **Accept**: server state only via TanStack Query; loaders for gating/prefetch not a second cache; cache cleared on logout + switch; FR-011, FR-012, FR-013, ADR-003/021
  - **Tests**: T062 — cache-clear on switch/logout unit/integration test
  - **Constraints**: Zustand only if justified + recorded in a `docs/decisions/` client-state note referenced from this spec (FR-014); no Tailwind
  - **Out**: product data fetching

- [x] T059 [US3] Desktop + mobile application shells + navigation IA
  - **Dep**: T058, T055
  - **Files**: `apps/web/src/app/shell/{DesktopShell,MobileShell,Navigation,WorkspaceSwitcher,AccountMenu}.tsx`
  - **Accept**: desktop nav + mobile `Home · Calendar · Clients · Recovery · More` (rest under `More`); deliberate mobile substitution not compressed desktop; fixed mobile nav doesn't cover primary actions; FR-015, hard product invariant
  - **Tests**: T062 component + a11y; E2E "load shell"
  - **Constraints**: IA from `docs/product-handoff.md`; visual detail from Figma `19 — Implementation Handoff` (surface ambiguity, don't invent)
  - **Out**: product screens

- [x] T060 [US3] Placeholder routes for every product destination (empty states only)
  - **Dep**: T059, T056
  - **Files**: `apps/web/src/app/routes/*` (Home, Calendar, Clients, Recovery, Messaging, Payments, Staff, Inventory, Marketing, Analytics, Settings) — each renders a system "empty/coming-later" state
  - **Accept**: every nav target reachable; no product behavior; FR-020, SC-014
  - **Tests**: route-render smoke tests
  - **Constraints**: no data fetching, no forms beyond auth
  - **Out**: everything product

- [x] T061 [US3] Light/Dark + reduced-motion shell infrastructure
  - **Dep**: T058, T052
  - **Files**: `apps/web/src/styles/` theme roots, `prefers-reduced-motion` global handling, View Transitions opt-in for route changes
  - **Accept**: all shell surfaces token-driven; reduced-motion degrades transitions with no info loss; focus preserved through transitions; FR-016, FR-017, `docs/standards/motion.md`, SC-007
  - **Tests**: T062 reduced-motion path test
  - **Constraints**: Motion for React only where it earns bundle cost, code-split
  - **Out**: product animations

- [x] T062 [P] [US3] Shell accessibility + theming + reduced-motion tests
  - **Dep**: T059, T061
  - **Files**: `apps/web/src/app/shell/__tests__/*.test.tsx`, `apps/web/e2e/shell-a11y.spec.ts`
  - **Accept**: axe clean on nav/switcher/dialogs; keyboard-only reaches every destination with visible focus; Light/Dark toggle token-driven; reduced-motion suppresses non-essential motion; SC-006, SC-007
  - **Tests**: this is the test task
  - **Constraints**: manual keyboard pass recorded in PR (CONTRIBUTING)
  - **Out**: n/a

- [x] T063 [US3] Retarget E2E journeys 6 & 7 onto the production shell; retire the test-nav harness from journeys
  - **Dep**: T059, T060, T050, T051
  - **Files**: `apps/web/e2e/journey-06-workspace-switch.spec.ts`, `journey-07-restricted-permission.spec.ts` (repoint selectors to the real shell), remove harness dependency; keep `apps/web/src/test-harness/` only if still useful for isolated debugging (still build-excluded)
  - **Accept**: journeys 6 & 7 pass against the real shell; production surface is covered; SC-017
  - **Tests**: the retargeted journeys
  - **Constraints**: no loss of coverage during the switch (run both briefly, then drop the harness variant)
  - **Out**: n/a

**Checkpoint**: shell is accessible, themed, responsive, with empty product routes; journeys run against the real shell. US3 independently testable.

---

## Phase 6: User Story 4 — Type-safe API contract pipeline (P2)  ·  **PR-15**

**Goal**: boundary schemas → OpenAPI → generated client/types/MSW in `packages/contracts`; `problem+json`; CI drift + breaking-change checks.

**Independent Test**: quickstart §6 — `contracts:generate` byte-identical on unchanged input; hand-edit fails `contracts:check`; SPA calls generated client with full types; forced errors are valid `problem+json`.

- [x] T064 [US4] Choose + wire runtime-schema → OpenAPI integration
  - **Dep**: T019, T020; **R4 decision record** (`docs/decisions/0004-...`)
  - **Files**: `apps/api/src/**/http/*.schema.ts` convention, OpenAPI emitter config, `pnpm openapi:generate` (deterministic)
  - **Accept**: one boundary schema per request/response is the single source (no decorator duplication); deterministic document; FR-034, FR-036, ADR-013
  - **Tests**: T067
  - **Constraints**: frontend never imports backend entities (FR-035); generation deterministic
  - **Out**: product endpoints

- [x] T065 [US4] `packages/contracts` generation: client + types + MSW handlers
  - **Dep**: T064, T016
  - **Files**: `packages/contracts/` (generated-only: `openapi.json`, typed client, types, MSW handlers), `pnpm contracts:generate`
  - **Accept**: artifacts generated-only, committed, never hand-edited; SPA imports from here; MSW handlers consumed by `packages/testing` (T016); FR-035
  - **Tests**: T067
  - **Constraints**: dependency-cruiser (T005) forbids `apps/web` → `apps/api` internals
  - **Out**: n/a

- [ ] T066 [US4] CI drift check + breaking-change detection
  - **Dep**: T065, T007
  - **Files**: `.github/workflows/fast.yml` (`contracts:check`), OpenAPI breaking-change diff step, `turbo.json` wiring
  - **Accept**: stale committed artifact fails CI 100%; regeneration byte-identical; a breaking schema change is flagged for explicit review; SC-008, FR-036, FR-038
  - **Tests**: fixture — hand-edit a generated file → CI fails; a breaking change → flagged
  - **Constraints**: deterministic ordering
  - **Out**: n/a

- [ ] T067 [P] [US4] Contract tests for all Phase 1 endpoints + `problem+json`
  - **Dep**: T064, T023, T038, T042, T046
  - **Files**: `apps/api/src/**/http/__tests__/*.contract.test.ts`
  - **Accept**: every endpoint's success + representative error validate against the generated schema; every forced error is valid `problem+json` with stable `type`; FR-037, contract catalogue
  - **Tests**: this is the test task
  - **Constraints**: breaking-change detection wired (FR-038)
  - **Out**: n/a

**Checkpoint**: contract pipeline deterministic, drift- and breaking-change-guarded. US4 independently testable.

---

## Phase 7: User Story 5 — Reliable asynchronous processing spine (P2)  ·  **PR-16**

**Goal**: the transactional outbox writer (already built in T022) is consumed by a background worker, with a **separate** Postgres-backed scheduler; at-least-once, idempotent, DLQ; concurrency-safe.

**Independent Test**: quickstart §7 — atomicity (T024, done earlier), crash/restart exactly-once effective, two-worker no-double-process, delayed job runs once + survives restart, repeated-failure → DLQ.

- [ ] T068 [US5] `apps/worker` outbox consumer loop
  - **Dep**: T022, T013
  - **Files**: `apps/worker/src/outbox/{claim.ts,dispatch.ts,handlers/*}`
  - **Accept**: claim via `FOR UPDATE SKIP LOCKED`; idempotent handlers; bounded attempts → `dead_lettered_at`; correlation propagated; FR-041, FR-043, FR-054
  - **Tests**: T070, T071
  - **Constraints**: consumes the existing platform outbox table/writer (T022) — no new outbox implementation; no product handlers, only identity foundation events
  - **Out**: notification delivery

- [ ] T069 [US5] Scheduler integration (selected library) + foundation jobs
  - **Dep**: T068; **R3 decision record** (`docs/decisions/0003-...`)
  - **Files**: `apps/worker/src/scheduler/{runner.ts,jobs/{expired-sessions,expired-invitations,outbox-retention}.ts}`
  - **Accept**: delayed + recurring jobs; server-authoritative time; bounded retry/backoff; explicit parked/DLQ outcome + alert; separate storage from the outbox; FR-042, FR-043, FR-044, ADR-014
  - **Tests**: T071
  - **Constraints**: Postgres-backed only; no Redis/Kafka; the scheduler and the outbox stay distinct components
  - **Out**: Recovery expiry jobs (roadmap Phase 4)

- [ ] T070 [P] [US5] Outbox consumer integration tests (at-least-once, crash/restart, idempotency)
  - **Dep**: T068
  - **Files**: `apps/worker/src/outbox/__tests__/consumer.int.test.ts`
  - **Accept**: kill worker mid-batch + restart → no lost/duplicate effect; redelivery is a no-op; bounded attempts land in `dead_lettered_at`; SC-009 (consumer half — writer atomicity is T024)
  - **Tests**: this is the test task
  - **Constraints**: Testcontainers; real process kill/restart
  - **Out**: n/a

- [ ] T071 [P] [US5] Concurrency tests — two workers, scheduled jobs
  - **Dep**: T068, T069
  - **Files**: `apps/worker/src/**/__tests__/concurrency.int.test.ts`
  - **Accept**: two concurrent workers process no record/job twice; delayed job runs exactly once + survives restart; repeated-failure job → DLQ within bound; SC-009, SC-010, FR-046
  - **Tests**: this is the test task
  - **Constraints**: genuinely concurrent connections; no sleeps
  - **Out**: n/a

**Checkpoint**: async spine reliable and concurrency-safe. US5 independently testable.

---

## Phase 8: User Story 6 — Safe schema evolution & environment model (P3)  ·  **PR-17**

**Goal**: four environment classes; gated migration release; expand→migrate→contract policy + PR checklist.

**Independent Test**: quickstart §8 — clean + forward migrations pass; migration is a standalone gated step; a sample non-trivial change is expressed as expand/contract stages.

- [ ] T072 [US6] Environment configuration model (local / preview-CI / staging / production)
  - **Dep**: T009; **R1 decision record** (`docs/decisions/0001-...`)
  - **Files**: `apps/*/src/config/*` (schema-validated env), `.env.example`, per-env secret-source docs
  - **Accept**: four classes; separately managed secrets; no shared credentials; no secrets in Git; FR-059
  - **Tests**: config schema validation test; CI check for committed secrets
  - **Constraints**: provider-neutral; adapter seams
  - **Out**: actual cloud provisioning (post-decision)

- [ ] T073 [US6] Security baseline wiring: rate limits, CSP/headers, CORS allowlist, dependency/secret scans
  - **Dep**: T019, T007
  - **Files**: `apps/api/src/modules/platform/security/*`, `.github/workflows/*` (dep + secret + SAST)
  - **Accept**: rate limits on auth + invitation-preview endpoints; scanners in CI; `docs/security/security-and-audit.md` web baseline
  - **Tests**: rate-limit integration test (429 `problem+json`)
  - **Constraints**: no auto-apply of major dep upgrades to `main`
  - **Out**: pen-test / incident drills (roadmap Phase 8)

- [ ] T074 [US6] Gated migration release + expand/contract PR checklist automation
  - **Dep**: T010, T012
  - **Files**: `.github/workflows/heavy.yml` (migration job), `docs/runbooks/migration-release.md`, PR template migration checklist
  - **Accept**: migration runs as an explicit gated job separate from app deploy; checklist enforced; roll-forward default; FR-060, FR-061, FR-062, FR-063, ADR-020
  - **Tests**: clean + forward-from-populated migration tests in heavy lane; SC-011
  - **Constraints**: no `push` shortcuts; no destructive-rollback assumptions
  - **Out**: n/a

- [ ] T075 [US6] Deployment topology runbook (containers, same-region DB, private networking)
  - **Dep**: **R1 decision record**
  - **Files**: `docs/runbooks/deployment.md`, `docs/decisions/0001-hosting-postgres-provider.md` (finalized)
  - **Accept**: documents environments, gated release, backups/PITR expectations; provider confirmed to support RLS/range/exclusion/`SET LOCAL`/backups/private-net; FR-064, FR-065
  - **Tests**: n/a (doc); isolation suite (T040/T044) re-run against the chosen provider connection model
  - **Constraints**: provider must not dictate architecture
  - **Out**: n/a

**Checkpoint**: release discipline established with only foundation tables. US6 independently testable.

---

## Phase 9: User Story 7 — Correlated observability seams (P3)  ·  **PR-18**

**Goal**: correlation across request → job; structured logs; vendor-neutral telemetry assertable in tests; redaction verified.

**Independent Test**: quickstart §9 — correlation id generated/preserved and present in all request logs + triggered-job logs; a telemetry event asserted with no network; sampled log/trace audit finds no sensitive field.

- [ ] T076 [US7] Correlation propagation request → outbox → worker job
  - **Dep**: T013, T019, T068
  - **Files**: `packages/observability-server/src/als-context.ts` (extend), outbox payload `request_id` plumb-through, worker context restore
  - **Accept**: same correlation id in request logs and in the logs/telemetry of any job it triggers; FR-054
  - **Tests**: T078
  - **Constraints**: no high-cardinality IDs as metric labels (FR-056)
  - **Out**: distributed tracing backend

- [ ] T077 [US7] Metrics separation (technical vs business) + OTel seam
  - **Dep**: T013
  - **Files**: `packages/observability-server/src/metrics.ts` (technical: latency/error/outbox-lag/pool; business namespace reserved), OTel exporter adapter interface
  - **Accept**: technical/business kept distinct; exporter is an adapter; `docs/observability/observability.md`
  - **Tests**: unit tests with an in-memory meter
  - **Constraints**: local/CI needs no vendor
  - **Out**: business metrics content (arrives with product phases)

- [ ] T078 [P] [US7] Observability integration tests (correlation, redaction, event assertion)
  - **Dep**: T076, T077, T018
  - **Files**: `apps/api/src/test/observability/*.int.test.ts`
  - **Accept**: correlation generated-if-absent / preserved-if-present across request+job; sampled logs/traces contain no configured sensitive field; a domain event asserted without network; FR-053, FR-055, FR-057, SC-012
  - **Tests**: this is the test task
  - **Constraints**: no network; deterministic
  - **Out**: n/a

**Checkpoint**: a single request/job is traceable end to end; redaction proven. US7 independently testable.

---

## Phase 10: User Story 8 — Phase 1 exit decision records (P3)  ·  **PR-00 (parallel, ongoing)**

**Goal**: evidence-backed founder-approved decision records for every open platform choice.

**Independent Test**: each record exists, cites options/evidence/rejected-alternatives, and is ADR-consistent or paired with an ADR-change proposal.

- [ ] T079 [P] [US8] R1 — managed hosting / PostgreSQL provider decision record
  - **Dep**: research.md R1
  - **Files**: `docs/decisions/0001-hosting-postgres-provider.md`
  - **Accept**: options considered; RLS/`btree_gist`/range-exclusion/`SET LOCAL`-under-pooling/backups/PITR/private-net evidence; choice + rejected alternatives; isolation suite re-run against the candidate; FR-065, SC-013
  - **Constraints**: no founder constraints (Clarifications) → recommend best fit; any ADR deviation → supersede proposal (FR-069)
  - **Out**: provisioning

- [ ] T080 [P] [US8] R2 — exact version-pin decision record + lockfile policy
  - **Dep**: research.md R2; a green fast+heavy run on candidate pins
  - **Files**: `docs/decisions/0002-version-pins.md`, `.nvmrc`, `packageManager`, committed lockfile
  - **Accept**: exact patches pinned after a documented compatibility run; "no auto major upgrades to `main`" policy; FR-066, SC-013
  - **Out**: n/a

- [ ] T081 [P] [US8] R3 — job-scheduler decision record (graphile-worker vs pg-boss)
  - **Dep**: research.md R3; T069 spike
  - **Files**: `docs/decisions/0003-job-scheduler.md`
  - **Accept**: compatibility/maintenance/ops/architecture-fit comparison; selection; separate-from-outbox confirmed; FR-067, ADR-014, SC-013
  - **Out**: n/a

- [ ] T082 [P] [US8] R4 — validation → OpenAPI integration decision record
  - **Dep**: research.md R4; T064 spike
  - **Files**: `docs/decisions/0004-validation-contract-integration.md`
  - **Accept**: candidate-set comparison; no-duplication confirmed; determinism proven; `problem+json` supported; FR-068, ADR-013, SC-013
  - **Out**: n/a

- [ ] T083 [P] [US8] R6 — CSRF mechanism decision record (or ADR-007 amendment)
  - **Dep**: research.md R6; T037
  - **Files**: `docs/decisions/0006-csrf-mechanism.md` **or** an `docs/adr/007-...` amendment proposal
  - **Accept**: mechanism chosen + enforcement point; contract tests referenced; closes the Phase 0 review gap
  - **Out**: n/a

- [ ] T084 [P] [US8] R5 — production identity provider: decision record OR "not required for exit" note
  - **Dep**: research.md R5; operational-need assessment
  - **Files**: `docs/decisions/0005-production-identity-provider.md` or an exit-checklist entry
  - **Accept**: if selected — plugs into ADR-007 adapter without model change, rejected alternatives stated; if not — explicit recorded note; FR-033e, FR-069a, SC-013
  - **Out**: implementing a real provider unless triggered

**Checkpoint**: all applicable exit decisions recorded and founder-approved.

---

## Phase 11: Polish & Cross-Cutting  ·  **PR-19, PR-20**

- [ ] T085 Dependency-cruiser rule **tightening** (beyond the core set)
  - **Dep**: T005, all module scaffolds (T029, T032, T022, …)
  - **Files**: `tooling/dependency-cruiser/.dependency-cruiser.cjs` (add narrower rules now that real modules exist: per-module public-entry allowlists, `packages/contracts` generated-only import direction, **`apps/web/src/test-harness` must never appear in the production import graph**)
  - **Accept**: tightened rules pass on real code; `docs/standards/ci-quality-gates.md`, FR-006
  - **Tests**: fixture violations per new rule; a check that the production build excludes `test-harness`
  - **Constraints**: core rules (T005) already in force since Phase 1 — this is additive only
  - **Out**: n/a

- [ ] T086 Provider-adapter mock enforcement in CI + separate provider smoke lane
  - **Dep**: T016, T007, T073
  - **Files**: `.github/workflows/fast.yml` + `heavy.yml` (assert no real provider network egress in ordinary test runs — e.g. network-block wrapper / allowlist), `.github/workflows/provider-smoke.yml` (manual `workflow_dispatch` + scheduled `cron`; runs the narrow provider contract/sandbox smoke tests against real provider sandboxes)
  - **Accept**: ordinary fast/heavy lanes make **no** real external-provider calls (provider adapters mocked behind ports); a **separate** manual/scheduled lane exercises real provider sandboxes; FR-049, ADR-006 guardrails, `docs/testing/strategy.md` §7
  - **Tests**: a deliberately un-mocked provider call in a normal test run is blocked/flagged; the smoke lane runs green on demand
  - **Constraints**: provider credentials only in the smoke lane's scoped secrets; never in fast/heavy lane env
  - **Out**: production provider integration (roadmap)

- [ ] T087 Heavy-lane workflow complete + required before merge
  - **Dep**: T033, T040, T047, T067, T070, T071, T062, T074, T078
  - **Files**: `.github/workflows/heavy.yml` (real-PG integration, migration, API integration, Playwright journeys 6/7 + smoke, axe, visual regression, security scans), sharding
  - **Accept**: required before merge; not bypassable for slowness; FR-007, FR-008
  - **Out**: n/a

- [ ] T088 [P] Visual-regression stories for shell primitives + system states
  - **Dep**: T056, T059
  - **Files**: Storybook stories + Playwright screenshot config for stable primitives/system states (Light + Dark)
  - **Accept**: targeted screenshots only; no full-route DOM snapshots; ADR-006 layer 10
  - **Out**: product screens

- [ ] T089 Performance baselines recorded + heavy-lane pre-merge budget agreed
  - **Dep**: T087
  - **Files**: `docs/runbooks/perf-baselines.md` (install/build/test times, **observed heavy-lane duration baseline**, route-bundle sizes), `docs/standards/ci-quality-gates.md` (record the **founder-agreed heavy-lane pre-merge time budget**)
  - **Accept**: (a) the observed heavy-lane duration is recorded as a baseline; (b) an explicit heavy-lane pre-merge time budget is agreed by the founder and recorded in `docs/standards/ci-quality-gates.md` **before Phase 1 exits**; thereafter the heavy lane must complete within that recorded budget; SC-002
  - **Tests**: n/a (measurement + recorded decision); a CI check that the heavy lane is within the recorded budget once it exists
  - **Out**: production load budgets / k6 (roadmap Phase 8)

- [ ] T090 Run full `quickstart.md` validation + exit-decision verification
  - **Dep**: T079–T084, T085–T089
  - **Files**: PR checklist, a Phase 1 exit note
  - **Accept**: SC-001…SC-018 demonstrably met (incl. SC-002's recorded heavy-lane baseline + budget); reviewer confirms no product behavior (SC-014); delivered as bounded PRs (SC-015)
  - **Out**: n/a

- [ ] T091 [P] Docs sync: `docs/implementation-plan.md`, ADR amendments, event catalogue, issue #2 reconciliation
  - **Dep**: T079–T084, T085
  - **Files**: `docs/implementation-plan.md` (Phase 1 exit ticked), any accepted ADR amendment (ADR-014 wording D3, ADR-007 CSRF D2), `docs/architecture/event-catalogue.md`, note issue #2's `packages/observability` singular vs the two-package split (D1)
  - **Accept**: committed docs match shipped behavior; Phase 0 review C1/D-items dispositioned
  - **Out**: n/a

---

## Dependencies & Execution Order

### Phase order

1. **Phase 1 Setup** (PR-01) — no deps; **includes architecture enforcement (T005/T006)** so it is live before any module
2. **Phase 2 Foundational** (PR-02…PR-05) — needs Setup; **blocks all user stories**; **includes the transactional outbox writer (T022)** as platform infrastructure
3. **Phase 3 US1** (PR-06) — needs Setup + Foundational (runnable apps + wired CI)
4. **Phase 4 US2** (PR-07…PR-11) — needs Foundational; **fully independently testable** via the test-nav harness (T048); invitation acceptance (T045) consumes the already-built platform outbox writer (T022) — **no forward dependency**
5. **Phase 5 US3** (PR-12…PR-14) — needs Foundational; the Nova token/consumer pipeline (pinning reviewed `@nova-component/design-tokens` and `@nova-component/ui` versions per ADR-025) can start right after Setup; T063 retargets the US2 journeys onto the real shell
6. **Phase 6 US4** (PR-15) — needs Phase 2 + endpoints from US2/US3 to have schemas
7. **Phase 7 US5** (PR-16) — needs Foundational; **consumes** the T022 outbox writer; adds worker/scheduler/retries/DLQ
8. **Phase 8 US6** (PR-17) — needs `packages/db` (Phase 2) + R1 record
9. **Phase 9 US7** (PR-18) — extends Phase 2 observability; needs the worker (US5) for the request→job correlation test
10. **Phase 10 US8** (PR-00) — **parallel/ongoing** from day one; each record finalizes as its spike completes
11. **Phase 11 Polish** (PR-19, PR-20) — needs the stories it hardens

### Cross-phase dependency notes

- **No forward dependencies remain.** The former `T044 → T067` (invitation → outbox) is resolved: the minimal transactional outbox writer is now `T022` in Phase 2 (PR-05), and `T045` (invitation acceptance) depends on it backward. Worker processing, scheduler, retries/backoff and dead-letter handling stay in US5 (`T068`–`T071`). The outbox writer is implemented exactly once (T022).
- **T063 (US3) → T050/T051 (US2 journeys)**: US3 retargets already-passing US2 journeys onto the real shell. US2 does not wait for US3.
- **T027 (US1 fast-lane hardening) → T005 (Setup dependency-cruiser)**: satisfied — same Setup phase / earlier PR.

### Parallel opportunities

- All Phase 1 `[P]` tasks (T002–T006, T008).
- Phase 2: PR-02, PR-03, PR-04 largely parallel; PR-05 needs PR-02 + PR-03.
- After Foundational: **US2, US3 (tokens→ui→shell), US5 proceed in parallel** by different contributors.
- Phase 10 exit-decision records (T079–T084) are all `[P]` and run alongside everything.
- All `*.int.test.ts` / `*.contract.test.ts` tasks marked `[P]` within a story.

---

## Bounded PR sequence (SC-015 — no "build all the foundation" PR)

| PR | Title | Tasks | Depends on |
|----|-------|-------|-----------|
| PR-00 | Phase 1 exit-decision research records | T079–T084 | — (ongoing) |
| PR-01 | Monorepo + toolchain + architecture-boundary enforcement + fast-lane skeleton | T001–T008 | — |
| PR-02 | `packages/db` — client, gated migration runner, Testcontainers harness | T009–T012 | PR-01 |
| PR-03 | Observability seams + correlation (server/browser) | T013–T014 | PR-01 |
| PR-04 | Testing foundation — fast-check, MSW, `packages/testing` builders, telemetry test utils | T015–T018 | PR-01, PR-03 |
| PR-05 | `apps/api` bootstrap — Fastify, security, `problem+json`, tenancy context, **transactional outbox writer**, health | T019–T024 | PR-02, PR-03 |
| PR-06 | US1 — runnable skeleton apps + task scripts + fast-lane hardening + onboarding/merge policy | T025–T028 | PR-01…PR-05 |
| PR-07 | Identity + audit schema + RLS migrations + schema tests | T029–T033 | PR-05 |
| PR-08 | Session spine + credential adapter + dev adapter + CSRF + sign-in/out + `/me` | T034–T039 | PR-07 |
| PR-09 | Authorization policy + workspace switch + isolation & concurrency suites | T040–T044 | PR-08 |
| PR-10 | Invitation + membership acceptance flow | T045–T047 | PR-09 |
| PR-11 | Test-only nav harness + Playwright harness + journeys 6 & 7 | T048–T051 | PR-10 |
| PR-12 | Nova design-token foundation + Slotnova theme/semantic reconciliation layer (`packages/design-tokens`) + Stylelint token rules | T052–T054 | PR-01 |
| PR-13 | Nova-UI consumer foundation (`packages/ui`) + Slotnova composition/system-state layer + Storybook (local stories only) + proven-gap tracking | T055–T057 | PR-12 |
| PR-14 | `apps/web` shell — router/providers, desktop+mobile shells, IA, theme, placeholder routes, journey retarget | T058–T063 | PR-13, PR-08 |
| PR-15 | API contract pipeline — schemas→OpenAPI→`packages/contracts` + drift/breaking-change checks + contract tests | T064–T067 | PR-05 (+ PR-08/PR-14 endpoints) |
| PR-16 | `apps/worker` — outbox consumer loop + scheduler + idempotency/DLQ + concurrency tests | T068–T071 | PR-05, R3 record |
| PR-17 | Deployment/env model + gated migration release + security baseline + runbooks | T072–T075 | PR-02, R1 record |
| PR-18 | Observability deepening (US7) — request→job correlation, metrics separation, integration tests | T076–T078 | PR-03, PR-16 |
| PR-19 | Dependency-cruiser tightening + provider-mock CI + heavy lane + visual regression + perf baselines & budget | T085–T089 | most stories |
| PR-20 | Quickstart validation + docs/ADR sync + Phase 1 exit note | T090–T091 | all |

Founder merges each PR manually (FR-009). No auto-merge. **21 PRs (PR-00…PR-20).**

---

## Implementation Strategy

### MVP (US1)

PR-01 → PR-06 (Setup + Foundational + US1) → a reproducible, CI-enforced workspace with live architecture enforcement, the transactional outbox writer, and three runnable skeleton apps. Stop, validate, demo.

### Incremental delivery

US1 → US2 (the security-critical spine — highest architectural risk, deliver early; independently testable) → US3 (shell) → US4 (contract) → US5 (async worker) → US6/US7/US8 (release discipline, observability depth, decision records). Each phase is an independently testable increment behind its own PRs; product behavior is never added.

### Parallel team strategy

After Foundational: one track on US2 (backend spine + test-nav harness + journeys), one on US3 (Nova token/consumer pipeline → Slotnova composition layer → shell), one on US5 (worker/outbox consumer), with US8 decision records progressing alongside. Converge at PR-14 (journey retarget) and PR-19 (heavy lane).

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Every task is foundation-only; a task that seems to need product behavior is mis-scoped — stop.
- Tests fail first, then implementation; DB behavior is proven on real PostgreSQL only.
- The transactional outbox writer is built once (T022) and consumed by both feature code (T045) and the worker (T068) — never re-implemented.
- Commit per task or logical group; each PR links one bounded slice and states what is out of scope.
- Any accepted-ADR conflict discovered during implementation is surfaced in the PR and `/speckit-analyze`, never silently resolved.
