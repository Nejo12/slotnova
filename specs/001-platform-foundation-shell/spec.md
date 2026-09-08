# Feature Specification: Phase 1 — Platform Foundation & Shell

**Feature Branch**: `phase-1/platform-foundation-planning`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Phase 1 — Slotnova executable platform foundation & shell (no product-domain behavior). Establish the monorepo, the React/Vite SPA shell, the NestJS+Fastify API with minimal Identity/Workspace/Location/Membership/session foundation, secure sessions, CSRF, authorization policy boundary, PostgreSQL RLS with SET LOCAL workspace context and tenant-scoped repositories, runtime-schema-first validation → OpenAPI → generated client + problem+json, transactional outbox + worker + scheduler abstraction, layered testing harness, strict TypeScript / lint / dependency-cruiser / CI fast+heavy lanes / migration verification, structured logging / correlation IDs / OpenTelemetry seams, deployment environment model with gated migration release and expand/migrate/contract policy. Phase 1 exit decisions to research and record: managed hosting/PostgreSQL provider, exact version pins, graphile-worker vs pg-boss, Nest/Zod/OpenAPI integration. Planning/specification only, no implementation."

## Overview

Phase 1 delivers the **executable platform foundation** for Slotnova: the repository, build system, application shells, tenancy/session/authorization spine, API-contract pipeline, asynchronous processing spine, testing harness, quality gates, observability seams and deployment/migration model on which every later product phase (Booking, Scheduling, Recovery, Payments, …) is built.

Phase 1 deliberately ships **no product-domain behavior**. Its value is that it makes correctness mechanically enforceable — tenant isolation, type-safe contracts, reliable events, real-database tests, architecture boundaries and accessible shell infrastructure — before any feature code exists.

This specification is the WHAT/WHY. The HOW (framework wiring, file layout, library selection) belongs in `plan.md` and `tasks.md`, constrained by the accepted ADR-001…ADR-024 and `.specify/memory/constitution.md`.

## Clarifications

### Session 2026-09-08

- Q: What authentication posture should Phase 1 actually implement (not just leave a seam for)? → A: The complete Slotnova-owned authentication/session/authorization spine — secure server-managed sessions, CSRF, session rotation/revocation, active-workspace context, membership/role/permission enforcement, PostgreSQL RLS — plus the workspace invitation + membership-acceptance flow, sign-out, workspace switching, and integration/E2E tests. Credential verification itself sits behind the accepted ADR-007 Identity provider adapter: Phase 1 does **not** build bespoke password-hashing / login infrastructure and does **not** lock Slotnova to an auth vendor in this slice. Local/test environments use a controlled development credential adapter / seeded-user path that exercises the **same** real session, membership, authorization and RLS code paths. Production identity-provider selection/integration is a bounded Phase 1 exit decision **if required**, and must not change the Slotnova-owned session or authorization model.
- Q: Are there hard constraints the managed hosting / PostgreSQL provider research (FR-065) must respect? → A: None — the research is fully open; the decision record recommends the best fit on database capability, cost and operational burden for founder approval.
- Q: How much of the end-to-end test set should Phase 1 deliver? → A: The Playwright harness (including a second isolated browser context) **plus** journey 6 (active-workspace switch exposes no prior-workspace data) and journey 7 (restricted-permission user is denied a protected operation server-side).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean-checkout contributor onboarding (Priority: P1)

A contributor (human or agent) clones the repository at a clean commit and, using a documented and small set of commands, installs dependencies, builds every workspace unit, runs type-checking, linting and the fast test suite, and starts each application locally. Continuous integration runs the same gates on every push and blocks merge when any gate fails.

**Why this priority**: Nothing else in Phase 1 — or any later phase — can be built, reviewed or trusted without a reproducible workspace and an enforcing CI. This is the irreducible MVP of the foundation.

**Independent Test**: On a fresh clone with no prior caches, run the documented install/build/typecheck/lint/test commands and confirm they all succeed; open a pull request with a deliberate type error and a deliberate architecture-boundary violation and confirm CI fails with actionable messages.

**Acceptance Scenarios**:

1. **Given** a clean checkout on a supported operating system with the pinned toolchain, **When** the contributor runs the documented bootstrap commands, **Then** install, build, type-check, lint and the fast test suite all complete successfully with no manual patching.
2. **Given** the workspace is installed, **When** the contributor starts the web, API and worker applications locally, **Then** each starts, reports health, and the web shell loads in a browser.
3. **Given** a pull request that introduces a type error, a raw-value style violation, or a forbidden cross-module/layer import, **When** CI runs, **Then** the fast lane fails and names the offending rule and location.
4. **Given** an unchanged package, **When** CI runs again, **Then** the build system reuses cached results for that package rather than rebuilding it.

---

### User Story 2 - Secure, tenant-isolated operator session (Priority: P1)

An operator authenticates to Slotnova (credential verification happens behind the Identity provider adapter), receives a secure server-managed session, and selects an active workspace. A person joins a workspace by accepting an invitation. Every server operation runs inside the active workspace's context. A user with membership in workspace A cannot read or modify any record belonging to workspace B, and this is enforced by the database itself, not only by application code. Authorization for sensitive operations is decided on the server from workspace membership and permissions.

**Why this priority**: Multi-tenant isolation is a Slotnova hard invariant and a security-critical property. An omitted tenant predicate in later feature code must still be incapable of leaking data. This spine must exist and be provably correct before any tenant-owned table is created in Phase 2.

**Independent Test**: Seed two workspaces with a foundation record each; using a session scoped to workspace A (established through the development credential adapter, exercising the real session path), attempt every read and write path against workspace B's record over real PostgreSQL and confirm all are denied; issue and accept a workspace invitation and confirm the resulting membership/role; confirm a permission-restricted user receives a server-side denial (not merely a hidden UI control).

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** the operator signs in, **Then** a session is established in a mechanism that the browser cannot read as a script-accessible token, and the session can be revoked server-side and expires on a defined schedule.
2. **Given** an authenticated operator who is a member of more than one workspace, **When** they switch the active workspace, **Then** subsequent operations resolve against the newly selected workspace and any cached client-side server state from the previous workspace is discarded.
3. **Given** an authenticated session scoped to workspace A, **When** any request attempts to read or mutate a record owned by workspace B, **Then** the database denies the access regardless of whether application code included a workspace filter.
4. **Given** a state-changing request authenticated only by the session cookie, **When** the request lacks the required cross-site-request-forgery protection, **Then** the server rejects it.
5. **Given** a user whose membership lacks a required permission, **When** they invoke a protected foundation operation, **Then** the server denies it and returns a structured error describing the missing capability.
6. **Given** any tenant-owned table defined in the foundation, **When** the isolation test suite runs, **Then** it asserts row-level protection is enabled with a policy present for that table.
7. **Given** an authorized member issues a workspace invitation scoped to a specific role, **When** the invitee accepts it with a valid, unexpired, unused token, **Then** a membership with that role and its permissions is created and an append-only audit record is written.
8. **Given** an invitation token that is expired, already used, or revoked, **When** it is presented for acceptance, **Then** acceptance is refused and no membership is created or elevated.
9. **Given** the identical session, membership, authorization and RLS code paths, **When** they are exercised through the development credential adapter and through a production-shaped credential adapter, **Then** both produce identical isolation and authorization outcomes.
10. **Given** an authenticated operator, **When** they sign out, **Then** the session is revoked server-side (not merely cleared in the browser) and can no longer be used.

---

### User Story 3 - Accessible desktop and mobile application shell (Priority: P2)

An operator loads Slotnova and sees the application shell: the approved desktop navigation and the approved mobile navigation (`Home · Calendar · Clients · Recovery · More`), a workspace switcher, an account menu, Light and Dark themes driven by semantic tokens generated from the approved design source, and motion that respects a reduced-motion preference. Navigation targets are present as empty/placeholder surfaces — no product feature is implemented.

**Why this priority**: The shell is the integration point every later feature plugs into. Its accessibility, theming and responsive-substitution contracts are far cheaper to establish once, now, than to retrofit across many features. It is P2 because US1 and US2 must exist first.

**Independent Test**: Load the shell on desktop and mobile viewports; verify the navigation matches the approved information architecture; toggle Light/Dark and confirm all shell surfaces respond through tokens; enable reduced-motion and confirm non-essential animation is suppressed; run automated accessibility checks and a keyboard-only pass over shell navigation, the workspace switcher and any shell dialog/drawer.

**Acceptance Scenarios**:

1. **Given** a signed-in operator on a desktop viewport, **When** the shell loads, **Then** the desktop navigation and shell chrome render and every primary destination is reachable by keyboard with a visible focus indicator.
2. **Given** a signed-in operator on a mobile viewport, **When** the shell loads, **Then** the mobile navigation shows exactly `Home · Calendar · Clients · Recovery · More`, and the remaining destinations are reachable under `More`.
3. **Given** the shell is loaded, **When** the operator switches between Light and Dark, **Then** all shell surfaces update through semantic tokens with no hard-coded colors and no loss of contrast.
4. **Given** a browser with reduced-motion requested, **When** the operator navigates the shell, **Then** transitions degrade to non-animated or minimal motion and no information is conveyed by animation alone.
5. **Given** the shell renders a reusable system state (empty, loading, error, offline/degraded, permission-restricted), **When** that state is shown, **Then** it uses the shared system-state presentation and preserves any safe exit.
6. **Given** a shell drawer, sheet or dialog is opened, **When** it becomes visible, **Then** focus is trapped within it, Escape closes it, and focus is restored to the invoking control on close.

---

### User Story 4 - Type-safe API contract pipeline (Priority: P2)

A frontend contributor consumes Slotnova's API through a generated, strongly typed client. The client and its types are derived from the API's runtime request/response boundary schemas via a generated contract document; the frontend never imports server-internal domain or persistence types. Error responses follow a single structured problem format. CI fails if the committed generated artifacts are stale.

**Why this priority**: Establishing the contract direction (runtime schema → contract document → generated client) and the error format now prevents hand-maintained client drift and cross-layer type leakage across every future endpoint. P2 because it depends on the API application existing (US1) and is most valuable once real endpoints arrive in Phase 2.

**Independent Test**: Add a trivial foundation endpoint (e.g. health/context) with boundary schemas, regenerate the contract and client, confirm the frontend can call it with full type information; hand-edit a generated file and confirm CI's drift check fails; request an error path and confirm the response conforms to the structured problem format.

**Acceptance Scenarios**:

1. **Given** a foundation endpoint with defined request/response boundary schemas, **When** the contract-generation step runs, **Then** it deterministically produces the same contract document and client artifacts for the same input.
2. **Given** the generated client artifacts are committed, **When** a contributor changes a boundary schema without regenerating, **Then** CI detects the drift and fails.
3. **Given** any foundation endpoint returns an error, **When** the client receives it, **Then** the payload is in the single structured problem format with a stable type identifier, and the frontend can render it without server-internal detail.
4. **Given** the frontend build, **When** dependency rules are checked, **Then** any import of a server domain/persistence module from frontend code fails the check.

---

### User Story 5 - Reliable asynchronous processing spine (Priority: P2)

A state change committed in the database reliably produces a domain event that a background worker consumes exactly once, even if the worker crashes and restarts. Separately, delayed and recurring work (reminders, expiries, retries) runs on a durable Postgres-backed scheduler. Event publication and job scheduling are distinct mechanisms.

**Why this priority**: Recovery (Phase 4), Notifications (Phase 3) and Payments (Phase 5) all depend on an at-least-once event spine plus a scheduler that does not lose delayed work. Getting the separation and the delivery guarantees right in the foundation avoids a costly re-architecture later. P2 because it depends on the database foundation (US1) and has no product consumer until Phase 3.

**Independent Test**: In a transaction, write a foundation record and an outbox entry atomically; start a worker, confirm the event is delivered and marked processed; kill the worker mid-batch and restart it, confirm no event is processed twice and none is lost; enqueue a delayed job and confirm it runs after its delay and survives a worker restart; run two workers concurrently and confirm no event or job is double-processed.

**Acceptance Scenarios**:

1. **Given** a business write and its outbox record in one transaction, **When** the transaction rolls back, **Then** neither the write nor the event is visible.
2. **Given** unprocessed outbox records, **When** the worker runs, **Then** each is delivered to its handler and marked processed, and handlers are idempotent so redelivery causes no double effect.
3. **Given** the worker is terminated mid-batch, **When** it restarts, **Then** in-flight records are re-claimed and completed with no duplicate side effect.
4. **Given** two worker instances run concurrently, **When** they poll for work, **Then** no outbox record and no scheduled job is processed by more than one instance.
5. **Given** a job scheduled to run after a delay, **When** the delay elapses, **Then** the job runs once; **and** repeated failures move it to an explicit dead-letter/parked state rather than looping forever.
6. **Given** the async design, **When** it is reviewed, **Then** event publication and delayed/recurring scheduling are separate components with separate storage responsibilities.

---

### User Story 6 - Safe schema evolution and environment model (Priority: P3)

An operator promotes a database change through defined environments (local, preview/CI, staging, production). Production migrations run as an explicit, gated release step — never as a silent application-startup side effect. Non-trivial schema changes follow expand → migrate/backfill → contract so a previous and a new application version can run simultaneously during a deploy. Roll-forward is the default recovery path.

**Why this priority**: Release discipline is much cheaper to establish before there are product tables and real tenant data. P3 because Phase 1 itself introduces only a small foundation schema, but the policy and its verifying tests must exist at Phase 1 exit.

**Independent Test**: Run all migrations against an empty database and confirm success; run the forward migrations against a database pre-populated with a representative earlier schema and confirm success without data loss; confirm the production release process requires an explicit migration step distinct from application deploy; review a sample non-trivial change and confirm it is expressed as expand/contract stages.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** the full migration set runs, **Then** it completes and produces the expected schema including tenant row-level protection and policies.
2. **Given** a database at an earlier representative schema with data, **When** forward migrations run, **Then** they succeed with no destructive data loss and the application remains operable.
3. **Given** a production deployment, **When** it is performed, **Then** the schema migration is an explicit gated step that can be run and verified independently of shipping application code.
4. **Given** a non-trivial schema change, **When** it is reviewed, **Then** it is staged as expand, then backfill/migrate, then contract, with each stage independently deployable.
5. **Given** environment configuration, **When** it is inspected, **Then** local, preview/CI, staging and production have separately managed secrets and data and no shared credentials.

---

### User Story 7 - Correlated observability seams (Priority: P3)

An operator or engineer diagnosing a problem can follow a single request or job across the system: every inbound request and every worker job carries a correlation identifier that appears in structured logs and is available to tracing. Telemetry is emitted through vendor-neutral seams so tests can assert it without any hosted service, and no sensitive customer or payment data appears in logs or traces.

**Why this priority**: Observability designed in now is far more useful than observability retrofitted after incidents. P3 because Phase 1 has limited domain activity to observe, but the seams, correlation propagation and redaction rules must be in place before Phase 2 traffic.

**Independent Test**: Issue a request with and without a supplied correlation id; confirm one is generated when absent and preserved when present, and that it appears in every structured log line for that request and in the worker logs for any job it triggers; run a test that asserts a domain telemetry event was emitted using only in-process test tooling; scan a sample of logs and confirm no configured sensitive field is present.

**Acceptance Scenarios**:

1. **Given** an inbound request without a correlation id, **When** it is processed, **Then** a correlation id is generated, attached to every structured log line for that request, and returned to the caller.
2. **Given** an inbound request with a correlation id, **When** it triggers background work, **Then** the same correlation id is propagated to the worker's logs and telemetry for that unit of work.
3. **Given** server logs, **When** they are produced, **Then** they are structured records with stable event names and fields, not free-form concatenated strings, and the application's own log stream is not treated as the audit trail.
4. **Given** a test for a foundation operation, **When** it runs, **Then** it can assert the expected telemetry/domain events were emitted without network access to any vendor.
5. **Given** logs and traces, **When** inspected, **Then** no field configured as sensitive (customer PII, payment data, secrets, session material) is present.

---

### User Story 8 - Recorded Phase 1 exit decisions (Priority: P3)

Before Phase 1 is declared complete, the founder has an explicit, researched, written decision record for each open platform choice: the managed hosting / PostgreSQL provider (and its compatibility with required database capabilities and connection model), the exact pinned runtime and dependency versions (after a compatibility check), the selected Postgres-backed job-scheduler library, the selected request-validation-to-contract integration approach from ADR-013's accepted candidate set, and — only if a production identity provider is required for Phase 1 exit — the selected provider and its fit within the existing ADR-007 adapter boundary.

**Why this priority**: The accepted ADRs deliberately left these as Phase 1 selection tasks. They must be decided deliberately, with evidence, and recorded — not defaulted silently — because each has architecture-wide consequences (connection pooling vs transaction-scoped tenant context, cookie/domain topology, contract tooling shape). P3 because they gate Phase 1 *exit*, not Phase 1 start.

**Independent Test**: Confirm a written decision record exists for each of the four items, that each cites the compatibility evidence considered and the alternatives rejected, and that each is consistent with the accepted ADRs (or, where it diverges, raises an explicit ADR-change proposal rather than silently overriding).

**Acceptance Scenarios**:

1. **Given** Phase 1 nears completion, **When** the exit checklist is reviewed, **Then** a decision record exists for hosting/PostgreSQL provider, version pins, job-scheduler library and validation/contract integration, plus either a production-identity-provider decision record or an explicit note that one is not required for Phase 1 exit.
2. **Given** each decision record, **When** it is read, **Then** it states the options considered, the compatibility and operational evidence, the choice, and the rejected alternatives with reasons.
3. **Given** a decision that conflicts with an accepted ADR, **When** it is recorded, **Then** it is accompanied by an explicit ADR supersede/amend proposal for founder approval rather than an in-place change.
4. **Given** the provider decision, **When** it is made, **Then** it confirms support for row-level security, range/exclusion constraints, transaction-scoped session configuration under the intended connection-pooling model, backups and private networking.

---

### Edge Cases

- **Connection pooling breaks transaction-scoped tenant context**: if the selected provider or pooler runs in a mode that does not preserve per-transaction session configuration, the tenant-context mechanism must be adjusted (or the pooling mode constrained) — this must be caught by the isolation tests, not discovered in production.
- **Session cookie prefix unavailable**: if deployment topology (e.g. a shared parent domain, non-HTTPS preview) prevents the strongest cookie prefix, the fallback and its residual risk must be documented, and preview/staging must not weaken production behavior.
- **Credential adapter divergence**: the development and production credential adapters must enter identical session, active-workspace-context, authorization and RLS code paths; any divergence that lets one path skip workspace context or RLS must fail tests.
- **Invitation token abuse**: invitation tokens must be single-use, short-lived and revocable; a leaked or replayed invitation must not grant membership twice, grant a higher role than issued, or work after revocation.
- **Sign-out completeness**: signing out must revoke the session server-side; a copy of the pre-logout session material must not remain usable.
- **Workspace switch race**: a request in flight when the operator switches workspace must not resolve against the new workspace with stale assumptions; the active-workspace context is fixed per request.
- **Outbox growth**: without retention/archival the outbox table grows unbounded; a retention approach must exist even in the foundation.
- **Generated-artifact merge conflicts**: two branches regenerating contract artifacts will conflict; the workflow must make regeneration cheap and the drift check authoritative.
- **Reduced-motion vs essential feedback**: suppressing motion must never remove the only signal that a high-consequence action committed.
- **Empty workspace / first-run**: a newly created user with no workspace membership must land in a coherent state, not a broken shell.
- **CI cache poisoning**: a corrupted or stale cache entry must not mask a real failure; cache keys must be correct and bypassable.
- **Migration on populated database with active old app version**: expand/contract staging must be verified against the scenario where old and new app versions overlap.
- **Clock skew for session expiry**: session/authentication expiry must use server-authoritative time.

## Requirements *(mandatory)*

### Functional Requirements

#### Repository, build system and quality gates

- **FR-001**: The repository MUST be organized as a single multi-package workspace containing exactly three deployable applications — an operator web application, an API application, and a background-worker application — plus shared library packages, with one dependency graph and a task runner that caches unchanged work.
- **FR-002**: Shared library packages MUST be limited to genuinely reusable concerns: reusable UI primitives (with their component workshop colocated), generated design/motion tokens, generated external API client artifacts, database client/migration/test-harness tooling, shared test builders/fixtures, browser telemetry helpers, server/worker telemetry helpers, and shared lint/compiler configuration. No package may be a generic `common`/`core`/`shared`/`utils`/`helpers`/`types`/`constants` catch-all, and no package may be created merely to mirror a business domain.
- **FR-003**: Business/domain packages MUST NOT exist in Phase 1; backend modules live inside the API application until multiple real consumers justify extraction.
- **FR-004**: The workspace MUST enforce strict type-checking with no convenience escape hatches; any relaxation of a compiler strictness setting requires written justification in the pull request.
- **FR-005**: Code style and design-token usage MUST be linted such that raw colors and raw motion durations/easings outside the token layer are rejected, with only narrowly documented exceptions.
- **FR-006**: Architecture boundaries MUST be mechanically enforced (not by directory naming alone), failing the build on: frontend importing database/infrastructure code; domain code importing transport or third-party provider SDKs; one backend module importing another module's repository or schema; deep imports that bypass a module's or package's public entry point; circular dependencies; and server observability packages imported into browser code.
- **FR-007**: Continuous integration MUST provide a fast lane (formatting, linting, token rules, architecture-boundary checks, type-checking, unit/property tests, changed-package component tests, build/type-generation smoke) that targets under three minutes, and a heavy lane required before merge (real-database integration tests, migration tests, API integration tests, critical end-to-end journeys, accessibility checks, visual regression where affected, dependency/security scans).
- **FR-008**: Continuous integration MUST reuse cached results for deterministically unchanged work and MUST NOT allow heavy-lane tests to be bypassed because they became slow.
- **FR-009**: The merge policy MUST prohibit automatic merge; required checks must be green or explicitly documented as non-applicable; the founder performs the final merge.
- **FR-010**: A clean checkout MUST install, build, type-check, lint and pass the fast test suite using a small documented command set, with the required toolchain versions declared in the repository.

#### Frontend application shell

- **FR-011**: The web application MUST be a client-rendered single-page application using a data-capable router, where route-level modules handle only routing, gating, prefetch and navigation concerns and never own business invariants.
- **FR-012**: Remote/server state MUST be owned by a single server-state cache; the same server data MUST NOT be sourced through both route loaders and the cache.
- **FR-013**: Server-state cache keys MUST be scoped by active workspace, and the cache MUST be cleared on sign-out and on workspace switch.
- **FR-014**: Client-only cross-route state MUST use a minimal dedicated store and only where URL state, server state and local component state are insufficient; each such use is justified in a short client-state decision note under `docs/decisions/` (e.g. `docs/decisions/0007-client-only-state.md`) referenced from this feature spec.
- **FR-015**: The shell MUST present the approved desktop navigation and the approved mobile navigation `Home · Calendar · Clients · Recovery · More`, with the remaining destinations reachable under `More` on mobile; mobile layouts are deliberate substitutions, not compressed desktop layouts.
- **FR-016**: All shell theming (Light and Dark) MUST be driven by semantic tokens generated from the approved design source through a deterministic, checked-in, never-hand-edited pipeline; token names describe semantic purpose, not literal values. (Token-set scope and the theme-mode mapping rule are FR-022.)
- **FR-017**: The shell MUST respect a reduced-motion preference globally; no information may be conveyed by animation alone; focus MUST be preserved through transitions; and exit animations MUST NOT delay high-consequence state commits.
- **FR-018**: The shell MUST provide a shared presentation for the reusable system states (empty, loading, no results, error, offline/degraded, success, destructive confirmation, permission-restricted, partial/stale data), each preserving a safe exit and never relying on color alone to convey status.
- **FR-019**: Shell dialogs, drawers and sheets MUST trap focus while open, close on Escape, restore focus to the invoking control on close, and MUST NOT become interactive before their focus contract is valid.
- **FR-020**: Navigation destinations for product surfaces MUST render as placeholder/empty surfaces only; no product-domain behavior is implemented in Phase 1.
- **FR-021**: The reusable UI primitive library MUST contain no product-domain logic and MUST NOT import domain services; its component workshop is colocated with it and is not a deployable application.
- **FR-022**: The token set (produced by the FR-016 pipeline) MUST cover color, typography, spacing/radius where represented, elevation and motion. Light/Dark MUST be expressed by mapping semantic tokens per mode — never by per-component style overrides.

#### Identity, session, tenancy and authorization foundation

- **FR-023**: The foundation MUST define the minimal identity and tenancy data needed for safe multi-tenant context: users, workspaces, locations, workspace memberships (carrying role and permissions), and session state. No other product entity is defined in Phase 1.
- **FR-024**: Every tenant-owned table MUST carry a workspace identifier (and a location identifier where location-scoped), and this MUST be enforced structurally, not by naming convention.
- **FR-025**: Browser authentication MUST use a secure server-managed session that is not readable as a script-accessible token, carried with the strongest cookie protections the deployment topology permits; the server owns session revocation, rotation and expiry using server-authoritative time.
- **FR-026**: State-changing requests authenticated by the session cookie MUST require and validate cross-site-request-forgery protection.
- **FR-027**: Credential verification MUST sit behind the accepted Identity provider adapter (ADR-007). Phase 1 MUST NOT build bespoke password-hashing, credential-storage or login infrastructure and MUST NOT lock Slotnova to an authentication vendor in this slice. Slotnova owns session issuance, rotation, revocation and all authorization regardless of which credential adapter is active; provider-supplied role or permission claims MUST NEVER be the authorization source of truth. Multi-factor and single-sign-on are not built in Phase 1, but the adapter boundary MUST accommodate them later without reworking the session or authorization model.
- **FR-028**: Every request and every background job that touches tenant-owned data MUST establish the active workspace context within its transaction such that the database enforces isolation for that transaction.
- **FR-029**: Tenant-owned data MUST be protected by database row-level security with policies present on every tenant-owned table; a user scoped to one workspace MUST be unable to read or mutate another workspace's records even if application code omits a workspace filter.
- **FR-030**: Data-access APIs for tenant-owned data MUST be workspace-scoped by construction; unscoped reads are forbidden outside narrowly reviewed platform/admin tooling.
- **FR-031**: Authorization for protected operations MUST be decided server-side from the authenticated user, active workspace, membership and permissions; UI permission state mirrors but never replaces server enforcement.
- **FR-032**: High-consequence foundation operations (e.g. permission changes, membership changes) MUST emit append-only audit records containing actor, workspace, action, entity reference, timestamp and correlation identifier; audit storage MUST be append-only at the database-privilege level, and the normal application role MUST NOT be able to update or delete audit rows.
- **FR-033**: An automated suite MUST prove cross-tenant isolation (workspace A cannot read/mutate workspace B) and MUST assert row-level protection coverage for every tenant-owned table, running against real PostgreSQL. Phase 1 MUST also deliver end-to-end journeys for (a) an active-workspace switch exposing no prior-workspace data and (b) a restricted-permission user being denied a protected foundation operation server-side.
- **FR-033a**: Phase 1 MUST implement the complete Slotnova-owned authentication/session/authorization spine — secure server-managed sessions, CSRF protection, session rotation and revocation, active-workspace context, and membership/role/permission enforcement backed by PostgreSQL RLS — independent of which credential adapter verifies the user.
- **FR-033b**: Phase 1 MUST implement a workspace invitation and membership-acceptance flow: an authorized member issues an invitation scoped to a workspace and role; the invitee accepts via a short-lived, single-use, revocable token; acceptance creates the membership with its role and permissions and is audited; a used, expired or revoked token is refused.
- **FR-033c**: An authenticated operator MUST be able to sign out — with the session revoked server-side, not merely cleared in the browser — and switch the active workspace; both MUST clear workspace-scoped client server-state per FR-013.
- **FR-033d**: Local and test environments MUST provide a controlled development credential adapter / seeded-user path that exercises the **same** real session, membership, authorization and RLS code paths as production — it MUST NOT bypass session issuance, active-workspace context or RLS. An automated check MUST demonstrate the development and a production-shaped adapter reach identical isolation/authorization outcomes.
- **FR-033e**: Production identity-provider selection and integration is a **bounded Phase 1 exit decision, recorded only if required** for Phase 1 exit; it MUST NOT change the Slotnova-owned session or authorization model, and its absence MUST NOT block foundation work that runs on the development credential adapter.

#### API contract pipeline

- **FR-034**: HTTP request and response schemas MUST be defined as runtime-validating schemas at API module boundaries and MUST be the single source from which the external contract document is generated.
- **FR-035**: The external contract document MUST generate the frontend client, types and HTTP-mock artifacts into the dedicated generated-artifacts package; frontend code MUST NOT import server-internal domain or persistence types.
- **FR-036**: Contract and client generation MUST be deterministic (same input produces identical output) and CI MUST fail when committed generated artifacts are stale relative to the boundary schemas.
- **FR-037**: All API error responses MUST use a single structured problem format with a stable type identifier; error-contract tests MUST exist for changed endpoints.
- **FR-038**: Breaking contract changes MUST be detectable in review and MUST carry explicit versioning/deprecation treatment.
- **FR-039**: Phase 1 MUST include at least one non-product foundation endpoint (e.g. health and active-session/workspace context) exercising the full boundary-schema → contract → generated-client path end to end.

#### Asynchronous processing spine

- **FR-040**: A business state change and its corresponding domain-event record MUST be persisted atomically in the same database transaction (transactional outbox); if the transaction fails, neither is visible.
- **FR-041**: Outbox consumers MUST be idempotent, MUST claim work with safe concurrent semantics so no record is processed by more than one worker, and MUST deliver external side effects with idempotency keys.
- **FR-042**: Delayed, recurring and retryable work MUST run on a durable Postgres-backed scheduler that is a separate component from the transactional outbox, with separate storage responsibility.
- **FR-043**: Retries MUST be bounded and observable, and repeated failures MUST move work to an explicit dead-letter/parked state rather than retrying indefinitely.
- **FR-044**: The outbox MUST have a retention/archival approach that prevents unbounded table growth.
- **FR-045**: Cross-boundary event payloads MUST carry stable names, a version, and correlation/workspace context while minimizing personal data; an event catalogue MUST record them.
- **FR-046**: Concurrency behavior of the outbox and scheduler MUST be verified with genuinely concurrent database connections/workers, not sequential loops.

#### Testing harness

- **FR-047**: The workspace MUST provide a layered test harness: fast unit tests, property-based tests for invariant-heavy logic, component tests for user-visible behavior and accessibility semantics, HTTP-boundary mocking for component/workshop/dev fixtures, real-PostgreSQL integration tests via disposable containers, API integration tests against real PostgreSQL, genuinely concurrent multi-connection tests, a small end-to-end journey harness, automated accessibility checks, and a component-workshop visual-state harness.
- **FR-048**: Database-specific correctness (row-level security, constraints, transactions, locking, migrations, outbox claiming) MUST be proven against real PostgreSQL and MUST NEVER be considered proven by mocks.
- **FR-049**: Ordinary CI test runs MUST make no calls to real external provider services; provider adapters are mocked behind their ports, with narrow provider contract/sandbox smoke tests kept separate.
- **FR-050**: Tests MUST NOT use arbitrary sleeps, MUST NOT assert only which mocked repository method was called, and MUST NOT be weakened to make a change pass.
- **FR-051**: The end-to-end harness MUST be able to run a second isolated browser context (needed later for the Recovery cross-context journey) and MUST support a workspace-switch isolation check.
- **FR-052**: Bug fixes MUST add regression coverage; flaky tests are defects and any quarantine is temporary and documented.

#### Observability, logging and correlation

- **FR-053**: The server MUST emit structured log records with stable event names and fields; the application log stream MUST NOT be treated as the audit trail.
- **FR-054**: Every inbound request MUST have a correlation identifier — generated if absent, preserved if supplied — that appears in every log line for that request, is returned to the caller, and is propagated into any background work it triggers.
- **FR-055**: Tracing and metrics MUST be emitted through vendor-neutral seams; vendor exporters are adapters; tests MUST be able to assert emitted domain/telemetry events without network access.
- **FR-056**: Technical health metrics and business metrics MUST be kept distinct, and high-cardinality identifiers MUST NOT be used as metric labels.
- **FR-057**: No field configured as sensitive (customer personal data, payment data, secrets, session material) may appear in logs or traces.
- **FR-058**: Error reporting MUST carry release and environment context and MUST be routed through a provider-neutral adapter.

#### Deployment, environments and migrations

- **FR-059**: The platform MUST define at least four environment classes — local, preview/CI, staging, production — with separately managed secrets and data and no shared credentials.
- **FR-060**: Production database migrations MUST run as an explicit gated release step, independently runnable and verifiable, and MUST NOT be an implicit application-startup side effect.
- **FR-061**: Non-trivial schema changes MUST follow expand → migrate/backfill → contract sequencing so that a previous and a new application version can operate simultaneously during a deploy.
- **FR-062**: Roll-forward MUST be the default recovery path; destructive rollback assumptions for data migrations are prohibited.
- **FR-063**: Migration pull requests MUST include a reviewed migration file (no production schema-push shortcuts), a clean-database migration test, a forward-migration test from a representative populated schema where practical, row-level-security/tenant-policy coverage checks, and an expand/contract/backfill plan for non-trivial changes.
- **FR-064**: Hosting/provider selection MUST remain adapter-compatible and MUST be finalized only after confirming support for the required database capabilities, the intended connection model, backups, private networking and observability.

#### Phase 1 exit decision records

- **FR-065**: Before Phase 1 exit, a written decision record MUST exist for the managed hosting / PostgreSQL provider, stating options considered, compatibility evidence (row-level security, range/exclusion constraints, transaction-scoped session configuration under the chosen pooling model, backups, private networking), the choice, and rejected alternatives. The founder has set **no** pre-existing constraint (region/residency, incumbent vendor, budget floor); the record recommends the best fit on capability, cost and operational burden for founder approval.
- **FR-066**: Before Phase 1 exit, a written decision record MUST pin exact runtime and dependency versions after a documented compatibility verification across the toolchain, framework adapters, database driver/tooling and test tooling.
- **FR-067**: Before Phase 1 exit, a written decision record MUST select the Postgres-backed job-scheduler library from the two accepted candidates, comparing compatibility, maintenance, operational complexity and fit with the accepted architecture.
- **FR-068**: Before Phase 1 exit, a written decision record MUST select the request-validation-to-contract integration approach from ADR-013's accepted candidate set, avoiding duplicated contract declarations.
- **FR-069**: Any Phase 1 decision that conflicts with an accepted ADR MUST be recorded together with an explicit ADR supersede/amend proposal for founder approval; it MUST NOT silently override the ADR.
- **FR-069a**: If a production identity provider is required for Phase 1 exit (per FR-033e), a written decision record MUST select it from an evaluated set, confirm it plugs into the existing ADR-007 adapter boundary without changing the Slotnova-owned session/authorization model, and state rejected alternatives; if not required for exit, the exit checklist records that explicitly.

#### Scope guard

- **FR-070**: Phase 1 MUST NOT implement Booking, Scheduling, Catalog, Recovery, Payments, Messaging, Notifications delivery, Staff, Inventory, Marketing/Retention or Analytics product behavior; only the platform/foundation capabilities that later phases require, plus adapter seams.

### Key Entities

- **User**: A person who can authenticate to Slotnova. Holds no tenant-owned operational data itself; connects to workspaces through memberships.
- **Workspace**: The tenant boundary. Every tenant-owned record belongs to exactly one workspace.
- **Location**: A place within a workspace; some records are additionally location-scoped. Carries the business/location timezone as an IANA zone identifier (structure only in Phase 1; no scheduling behavior).
- **Membership**: The association of a user with a workspace, carrying role and the permission set used for server-side authorization.
- **Invitation**: A short-lived, single-use, revocable token scoped to a workspace and a role that allows a person to become a workspace member on acceptance.
- **Session**: Server-managed authenticated session state, including the active workspace selection, with server-authoritative rotation/revocation/expiry.
- **Credential adapter**: The ADR-007 boundary behind which user credential verification happens. A development adapter (seeded users) and, if selected, a production identity-provider adapter both plug in here without changing session or authorization code.
- **Audit record**: An append-only entry describing a high-consequence change (actor, workspace, action, entity reference, timestamp, correlation id).
- **Outbox record**: A domain-event entry written atomically with the state change that caused it; carries a stable event name, version, and correlation/workspace context; consumed at least once, handled idempotently.
- **Scheduled job**: A durable unit of delayed/recurring/retryable work with bounded retries and an explicit dead-letter/parked state.
- **Contract document**: The generated external API description produced from boundary schemas; the single source for generated client/types/mocks.
- **Design token set**: The generated semantic tokens (color, typography, spacing/radius, elevation, motion) that drive Light/Dark and shell presentation.
- **Environment**: A deployment class (local, preview/CI, staging, production) with independently managed secrets and data.
- **Decision record**: A written, evidence-backed record of a Phase 1 exit decision, consistent with the accepted ADRs or accompanied by an explicit ADR-change proposal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor with no prior repository state can go from clone to a running web shell, running API and running worker by following the documented steps in under 30 minutes with no undocumented manual fixes.
- **SC-002**: The CI fast lane completes in under 3 minutes for a typical change on warm cache. For the heavy lane: (a) Phase 1 records the **observed heavy-lane duration** as a baseline in `docs/runbooks/perf-baselines.md`, and (b) an explicit **heavy-lane pre-merge time budget** is agreed by the founder and recorded in `docs/standards/ci-quality-gates.md` **before Phase 1 exits**; from that point the heavy lane must complete within the recorded budget. (Verifiable at exit: baseline recorded? budget recorded? heavy lane within budget?)
- **SC-003**: 100% of tenant-owned foundation tables have row-level protection enabled with a policy present, asserted automatically.
- **SC-004**: An automated test demonstrates that a session scoped to one workspace cannot read or mutate another workspace's record across every foundation data path, using real PostgreSQL and, for concurrency cases, genuinely concurrent connections.
- **SC-005**: A deliberately introduced architecture-boundary violation, type error, or raw-value style violation is caught by CI 100% of the time before merge.
- **SC-006**: The application shell passes automated accessibility checks with no violations on shell navigation, the workspace switcher and shell dialogs/drawers, and a keyboard-only operator can reach every primary destination with a visible focus indicator.
- **SC-007**: Light/Dark theming is 100% token-driven for shell surfaces — no hard-coded color or raw motion value passes lint outside the token layer.
- **SC-008**: Regenerating the API contract and client from unchanged boundary schemas produces byte-identical artifacts, and a stale committed artifact fails CI 100% of the time.
- **SC-009**: In an outbox test, after killing and restarting the worker mid-batch, exactly-once effective processing is observed (no lost events, no double effects), and two concurrent workers process no record twice.
- **SC-010**: A scheduled delayed job runs exactly once after its delay and survives a worker restart; a repeatedly failing job lands in a dead-letter/parked state within its configured bound.
- **SC-011**: The full migration set applies cleanly to an empty database and forward-applies to a representative populated database with zero destructive data loss.
- **SC-012**: For any foundation request, its correlation id appears in 100% of that request's structured log lines and in the logs/telemetry of any background job it triggers, and no configured sensitive field appears in a sampled log/trace audit.
- **SC-013**: All applicable Phase 1 exit decision records — managed provider, exact version pins, scheduler library, validation/contract integration, and production identity provider *if required for exit* — exist, cite evidence and rejected alternatives, and are either ADR-consistent or paired with an ADR-change proposal; confirmed before Phase 1 is declared complete.
- **SC-014**: A reviewer confirms no Booking/Scheduling/Catalog/Recovery/Payments/Messaging/Notifications/Staff/Inventory/Marketing/Analytics product behavior is present in the Phase 1 deliverable.
- **SC-015**: The Phase 1 implementation is delivered as a sequence of independently reviewable bounded pull requests, each linked to a task, with no single "build all of the foundation" pull request.
- **SC-016**: The development credential adapter and a production-shaped credential adapter are proven — by the same integration tests running against both, or a contract test proving equivalence — to traverse identical session-issuance, active-workspace-context, authorization and RLS code, with no path that skips workspace context or RLS.
- **SC-017**: End-to-end journeys for (a) workspace-switch data isolation and (b) restricted-permission server-side denial, plus a sign-in smoke journey, pass in CI; the harness can run a second isolated browser context.
- **SC-018**: The workspace invitation flow is proven: a valid token creates exactly the invited role's membership with an audit record, and an expired, used or revoked token is refused with no membership change.

## Assumptions

- **Authority**: This spec is subordinate to `.specify/memory/constitution.md` and the accepted ADR-001…ADR-024. Where this spec and an accepted ADR appear to conflict, the ADR wins and the conflict is surfaced (see `analysis` output), not silently resolved here.
- **Product IA**: The desktop navigation and the mobile `Home · Calendar · Clients · Recovery · More` navigation from `docs/product-handoff.md` are treated as approved. Exact visual detail comes from Figma `18 — Prototypes` / `19 — Implementation Handoff`; where full Figma access is unavailable, the committed handoff governs behavior and visual ambiguity is surfaced rather than invented.
- **Authentication mechanism** (clarified 2026-09-08): Phase 1 builds the full Slotnova-owned session/authorization/RLS spine and the workspace invitation/membership flow, but credential verification sits behind the ADR-007 Identity provider adapter — no bespoke password/login infrastructure and no auth-vendor lock-in in this slice. Local/test uses a controlled development credential adapter exercising the same real code paths. Production identity-provider selection is a bounded exit decision only if required (FR-033e, FR-069a). See Clarifications.
- **Shell breadth**: The Phase 1 shell renders the full approved navigation with every product destination present as an empty/placeholder surface, so later phases attach features without shell rework.
- **Provider neutrality**: All infrastructure is built against adapter seams so the hosting/PostgreSQL provider decision (FR-065) can be made late in Phase 1 without schema or code rework. The founder set no provider constraints (clarified 2026-09-08), so the decision record recommends the best fit for founder approval. The isolation tests are the guardrail that a chosen provider's connection model is compatible with transaction-scoped tenant context.
- **Toolchain baseline**: The research baseline (React 19.2 / Vite 8 / Node 24 LTS / PostgreSQL 18 where the provider supports it) from `docs/architecture/research-basis.md` is the starting point; exact patches are pinned only at FR-066 after compatibility verification.
- **Scheduler candidates**: The two accepted job-scheduler candidates are graphile-worker and pg-boss (ADR-014). No other queue technology is in scope.
- **Deployment provider timing**: Per ADR-020, provider selection is finalized before Phase 1 *exit*, not before Phase 1 start; Phase 1 implementation work that does not depend on the provider proceeds in parallel with the research.
- **Design-token source access**: The token pipeline (ADR-022) assumes access to the approved Figma Variables during the token-generation task; if unavailable, the pipeline is still built and seeded with a documented interim token set flagged for reconciliation.
- **No production data**: Phase 1 involves no real customer PII; retention/erasure workflows (ADR-019) are designed but exercised with synthetic data.
- **Team size**: A small team; the plan favors a small number of well-understood tools over breadth, consistent with the constitution's "simple architecture over speculative abstraction".

## Dependencies

- Accepted ADR-001…ADR-024 and `.specify/memory/constitution.md` (Phase 0, merged in PR #10).
- `docs/architecture/overview.md`, `docs/architecture/domain-modeling.md`, `docs/testing/strategy.md`, `docs/security/security-and-audit.md`, `docs/observability/observability.md`, `docs/standards/ci-quality-gates.md`, `docs/standards/motion.md`, `docs/implementation-plan.md`.
- GitHub issue #2 (Phase 1 scope and acceptance criteria).
- Approved Figma corpus for visual/interaction detail (`docs/product-handoff.md`), with the documented generic-API access caveat.
- Availability of a container runtime in CI and locally for real-PostgreSQL tests.

## Out of Scope

- Any Booking, Scheduling, Catalog, Recovery, Payments, Messaging, Notifications delivery, Staff, Inventory, Marketing/Retention or Analytics product behavior (Phases 2–7).
- Real external provider integrations beyond typed adapter seams and, where needed, sandbox smoke tests.
- Bespoke password-hashing / credential-storage / login UI infrastructure; multi-factor authentication; single-sign-on; and production external identity-provider integration. The ADR-007 credential adapter boundary is built and exercised through a development credential adapter; a production provider is a bounded exit decision only if required (FR-033e, FR-069a) and does not change the Slotnova-owned session/authorization model.
- Production hardening, load/performance budgets beyond recording Phase 1 baselines, incident runbook drills, and backup/restore drills (Phase 8).
- Visual regression coverage beyond shell primitives and system states.
- Client dedupe/merge, generic resource/capacity modeling, and other explicitly deferred Phase 0 items.
