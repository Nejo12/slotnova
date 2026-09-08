# Phase 0 Research — Platform Foundation & Shell

**Status**: Planning research. Recommendations here feed the founder-approved **decision records** under `docs/decisions/` (R1–R6). Where a recommendation depends on version/provider facts that move, the decision record re-verifies against primary sources at the time it is written (FR-064, FR-066). This document does not authorize implementation.

Format per item: **Decision** (what is proposed) · **Rationale** · **Alternatives considered** · **Verification required before the decision record is finalized**.

---

## R1 — Managed hosting / PostgreSQL provider (FR-065)

**Decision (recommended, pending founder-approved decision record)**: Use a **fully-managed PostgreSQL provider that gives a direct (session-capable) connection option and first-class backups/PITR + private networking**, with the API and worker deployed as containers on a managed platform in the **same region** as the database. Recommended shortlist to evaluate in the decision record, in priority order:

1. **Amazon RDS / Aurora PostgreSQL** behind a container platform (ECS/Fargate or App Runner) — most operationally proven for RLS + session-scoped context, full control of pooling (RDS Proxy optional, session pinning available), mature backups/PITR/private networking. Higher baseline cost and setup effort.
2. **Neon** (serverless Postgres) + a container host (Fly.io / Render / Railway) — excellent DX, branching for preview/CI environments, generous low tier. Must verify: PgBouncer is in **transaction** pooling mode on the pooled endpoint; use the **direct/unpooled endpoint** or keep tenant context acquisition inside the same transaction so `SET LOCAL` is safe.
3. **Supabase** (managed Postgres, RLS-native) + container host — RLS is a first-class concept, good tooling; verify we are using our own roles/policies (not GoTrue-coupled auth) and the direct connection for migrations/session context.
4. **Render / Railway managed Postgres** + same-platform services — simplest single-vendor operations for a small team; verify PITR/backup retention and private networking meet the security baseline.

**Rationale**:
- The accepted stack (ADR-004, ADR-008, ADR-011) needs: RLS, `btree_gist` + range/exclusion constraints (first real use is Booking in Phase 2, but the extension must be available), `timestamptz`, transaction-scoped `SET LOCAL app.workspace_id`, genuine concurrent connections for tests, backups/PITR, private networking, and an observability hook.
- `docs/architecture/research-basis.md` already sets "PostgreSQL 18 **only if** the managed provider supports it appropriately; else newest provider-supported major preserving RLS/range/exclusion semantics." All four shortlist providers support a recent-enough major.
- Small team ⇒ weight operational burden and cost heavily; the founder set **no** constraints (Clarifications 2026-09-08), so optimize capability-per-operational-dollar.
- Provider neutrality is preserved in code: everything sits behind adapter seams and the migration runner in `packages/db`; the isolation suite is the guardrail that the chosen connection model preserves per-transaction tenant context.

**Alternatives considered**:
- **Self-hosted PostgreSQL on a VM** — rejected: backups, HA, patching and PITR become the team's problem; contradicts "simple operations" for a small team.
- **Cloudflare D1 / PlanetScale / non-PostgreSQL** — rejected: not PostgreSQL; loses RLS + range/exclusion semantics the architecture depends on (ADR-011).
- **Serverless Postgres in transaction-pooling-only mode with no direct endpoint** — rejected unless a direct endpoint exists, because migrations and session-scoped tenant context need session-capable connections.

**Verification required before the decision record**:
- Confirm the exact PostgreSQL major offered and that `btree_gist` is installable.
- Prove `SET LOCAL app.workspace_id` survives the provider's default pooled path, or document that tenant work must run on the direct endpoint / within one transaction. Run the Phase 1 isolation suite against the candidate before signing off.
- Confirm backup retention, PITR window, private networking, and a metrics/log export path.
- Confirm preview/CI ephemeral database strategy (branching, template DBs, or Testcontainers-only for CI + a shared staging DB).

---

## R2 — Exact runtime / dependency version pins (FR-066)

**Decision (recommended baseline; exact patches pinned in the decision record after a green compatibility run)**:

| Area | Baseline (from `research-basis.md` + current majors) | Notes |
|---|---|---|
| Node.js | current **Node 24 LTS** (latest patch on the active LTS at pin time) | `.nvmrc` + `engines` + CI matrix pinned to one line |
| Package manager | **pnpm** latest stable major; `packageManager` field pinned; lockfile committed | |
| Monorepo task runner | **Turborepo** latest stable major; remote cache enabled from day one | |
| React | **19.x** (baseline 19.2) | |
| Vite | **8.x** (baseline 8) | verify plugin-react + Vitest peer alignment |
| React Router | current major, **data router** (`createBrowserRouter`) | |
| TanStack Query | current major (v5 line) | workspace-scoped key factory |
| NestJS | current major with a **maintained Fastify adapter** | ADR-004 known risk: adapter can lag Fastify major — pin Fastify to the adapter-supported major, not newest |
| Fastify | the major the Nest adapter supports | |
| Drizzle ORM + drizzle-kit | current stable | migration files reviewed; no `push` in prod |
| PostgreSQL | provider-supported major (see R1); **18** preferred | |
| `@js-temporal/polyfill` | current | structure only in Phase 1 |
| Vitest | aligned with Vite 8 | |
| Playwright | current | |
| Storybook | current major, colocated in `packages/ui` | |
| Testcontainers (node) | current | |
| fast-check | current | |
| Style Dictionary (or equivalent) | current | token build |
| dependency-cruiser / ESLint / Stylelint / Prettier | current | flat ESLint config |

**Rationale**: `research-basis.md` already fixes the majors and mandates a compatibility check before pinning; this task executes that check and records the exact patch versions + a "no automatic major upgrades to `main`" policy (security baseline, supply chain).

**Alternatives considered**: Pinning to newest-of-everything (rejected — Nest/Fastify adapter lag is a real ADR-004 risk); leaving ranges unpinned (rejected — supply-chain + reproducibility).

**Verification required**: One CI run that installs, builds, type-checks, lints and runs the fast + heavy lanes green on the exact pins; record the resolved lockfile hash.

---

## R3 — Job scheduler: graphile-worker vs pg-boss (FR-067)

**Decision (recommended, pending decision record)**: **graphile-worker**, unless the decision record surfaces a blocking incompatibility.

**Rationale**:
- Both are Postgres-only, use `SKIP LOCKED` claiming, support delayed jobs and cron, and require no Redis/Kafka (ADR-014 ✔).
- **graphile-worker** strengths for Slotnova: very low latency via `LISTEN/NOTIFY`, `addJob` can be called **inside the same transaction** as a business write (useful later for Recovery expiry jobs scheduled atomically with an offer), strong TypeScript story, explicit retry/backoff, and a small well-scoped surface.
- **pg-boss** strengths: richer built-in queue semantics (pub/sub, batching, archive, dead-letter queues as first-class, singleton/throttled jobs), a slightly more "product" API. Its completion/archival model writes more and has historically been heavier on table churn.
- For Phase 1 we only need: durable delayed job, cron, bounded retry with backoff, an explicit dead-letter/parked outcome, `SKIP LOCKED`, and clean coexistence with a **separate** transactional outbox (distinct tables, distinct ownership — ADR-005/014). graphile-worker covers this with less operational surface.
- Dead-letter: graphile-worker parks a job after `max_attempts`; we add a thin "parked jobs" view/alert. pg-boss has native DLQ — a point in its favor, but not decisive.

**Alternatives considered**: pg-boss (close second; pick it if the decision record finds graphile-worker's maintenance cadence or Nest integration worse at pin time, or if native DLQ + pub/sub is judged worth the extra surface). Hand-rolled `SKIP LOCKED` queue (rejected — ADR-014 explicitly says don't hand-roll durable queue behavior). BullMQ/Redis (rejected — introduces Redis without evidence).

**Verification required**: maintenance/security posture of both at pin time; Nest DI integration shape; confirm the outbox and the scheduler use separate tables and a separate worker loop in `apps/worker`; a concurrency test proving two workers don't double-run a scheduled job.

---

## R4 — Runtime-validation → OpenAPI integration (FR-068, ADR-013 candidate set)

**Decision (recommended, pending decision record)**: Define API boundary schemas **once** with a Zod-compatible schema library and generate OpenAPI from those schemas; generate the client + types + MSW handlers from the OpenAPI document into `packages/contracts`. Recommended concrete approach:

- **Boundary schemas**: Zod (or a Zod-compatible validator). One schema per request/response at each controller boundary — the single source of truth.
- **Nest integration**: a Zod-first pipe/interceptor (e.g. `nestjs-zod` or an equivalent maintained integration) so validation and OpenAPI metadata both derive from the same Zod object — **no** duplicated `@ApiProperty` decorator declarations (that duplication is exactly what ADR-013 forbids).
- **OpenAPI emission**: `zod-to-openapi` (or the integration's built-in emitter) producing a deterministic document; the document is committed and diffed.
- **Client/types/MSW generation**: `openapi-typescript` for types + a thin typed fetch client, and an MSW handler generator, all output to `packages/contracts` and **generated-only** (never hand-edited; CI drift check).
- **Errors**: a shared `problem+json` (RFC 9457) schema; a Nest exception filter maps all errors to it; contract tests assert the shape.

**Rationale**: Matches ADR-013's accepted direction exactly (runtime schema → OpenAPI → generated client; frontend never imports backend entities). Zod is the de-facto boundary-validation choice in this stack and has the richest OpenAPI/codegen ecosystem. Determinism is achievable and is a hard requirement (FR-036, SC-008).

**Alternatives considered**:
- **TypeSpec / OpenAPI-first** (write the spec, generate server stubs + client) — rejected for Phase 1: inverts the accepted "runtime schema is the source" direction and adds a modeling language.
- **`@nestjs/swagger` decorators as the source** — rejected: decorator metadata duplicates the runtime schema; ADR-013 explicitly wants to avoid "decorator duplication".
- **tRPC** — rejected: no OpenAPI contract, couples client to server types, contradicts ADR-013's "generated artifacts, independent domain models".
- **Valibot instead of Zod** — viable (smaller bundle) but weaker codegen ecosystem today; note as a fallback.

**Verification required**: pick the specific maintained Nest+Zod integration at pin time; prove byte-identical regeneration on unchanged input; prove a hand-edit fails CI; confirm `problem+json` round-trips through the client types.

---

## R5 — Production identity provider (conditional; FR-033e / FR-069a)

**Decision**: **Deferred and conditional.** Phase 1 implements the credential-adapter **port** (ADR-007) with:
- a **development credential adapter** (seeded users, no password infrastructure) used for local + all automated tests, and
- a **production-shaped test double** used to prove adapter parity (SC-016).

A real production provider is selected **only if** operating Phase 1 (e.g. a staging environment with real logins) requires it before exit. If selected, evaluate providers that are pure credential/verification layers behind the port and do **not** own sessions or authorization:

- **WorkOS** (AuthKit / directory) — clean adapter fit, SSO/directory-ready for later, Slotnova keeps sessions.
- **Auth0 / Okta CIC** — mature, heavier, more expensive.
- **Clerk** — fast to adopt but wants to own more of the session/UI; adapter boundary must be enforced strictly.
- **Ory Kratos** (self-managed or Ory Network) — open, we keep full control; more ops.
- **A first-party email+password credential adapter** — always available as the fallback if no vendor is wanted; it is still *an adapter implementation*, not a change to the model, and would then need its own small ADR for password hashing/reset.

**Rationale**: The clarified posture is explicit — build the Slotnova-owned spine now, keep credentials behind the adapter, don't lock to a vendor, don't build bespoke password infra in this slice. The decision is genuinely conditional on operational need.

**Alternatives considered**: Building first-party password auth now (rejected by clarification); picking a vendor now with no operational need (rejected — premature lock-in).

**Verification required (only if triggered)**: the provider can be integrated without touching session issuance / `SET LOCAL` context / authorization policy; role/permission claims from the provider are ignored for authorization (FR-027).

---

## R6 — CSRF mechanism (closes the Phase 0 review gap on ADR-007)

**Decision (recommended, pending decision record or ADR-007 amendment)**: **Double-submit cookie token + strict `Origin`/`Sec-Fetch-Site` verification** for all state-changing, cookie-authenticated requests, layered on `SameSite=Lax` session cookies.

- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix where topology permits (R1 output confirms the domain model).
- CSRF token: a non-`HttpOnly` cookie mirrored into a request header (`X-CSRF-Token`) by the SPA; server compares cookie vs header. Rotated on session rotation.
- Additionally reject state-changing requests whose `Origin` (or `Sec-Fetch-Site`) is not same-site, as defense in depth.
- Enforced by a single Fastify plugin at the boundary; safe methods (GET/HEAD/OPTIONS) are exempt and must remain side-effect-free (hard prohibition: no state-changing GET).

**Rationale**: `SameSite=Lax` alone leaves top-level navigation POSTs and some legacy vectors; the double-submit pattern is stateless (no server session-token store needed), works cleanly with an SPA, and the `Origin` check is cheap belt-and-braces. Synchronizer-token (server-stored per-session token) is also fine but adds state we don't otherwise need for CSRF.

**Alternatives considered**: `SameSite=Strict` (rejected — breaks legitimate cross-site entry links, e.g. future invitation emails landing on an authenticated page); synchronizer token pattern (viable; more server state); origin-check only (rejected — insufficient alone for older clients / edge cases).

**Verification required**: confirm the chosen Nest/Fastify CSRF plugin is maintained; add contract tests: state-changing request without token → rejected; with mismatched token → rejected; with valid token → accepted.

---

## R7 — Session storage & rotation

**Decision**: **Server-side session records in PostgreSQL** (id, user, active `workspace_id`, created/last-seen/expires, revoked-at, user-agent/ip hint), referenced by an opaque cookie value. Rotate the session identifier on: sign-in, privilege change (membership/role/permission change), workspace switch, and on a sliding schedule. Revocation = set `revoked_at`; a revoked or expired session fails closed.

**Rationale**: ADR-007 requires **server-owned revocation and rotation** — a stateless signed cookie cannot be revoked before expiry. A session table is the minimal mechanism and is itself workspace-agnostic (belongs to `identity`, keyed by user, not tenant-scoped, so no RLS needed on it but access is via the identity module only).

**Alternatives considered**: signed stateless JWT/cookie (rejected — no revocation, contradicts ADR-007 and the `localStorage` prohibition); external session store (Redis) (rejected — introduces Redis without evidence; PostgreSQL is sufficient at this scale).

**Verification required**: confirm read cost of per-request session lookup is acceptable (indexed by session id); define the cleanup job for expired sessions (runs on the R3 scheduler).

---

## R8 — Design-token pipeline mechanics (ADR-022)

**Decision**: `Figma Variables export → normalized token JSON (committed) → Style Dictionary build → CSS custom properties + TS types in packages/design-tokens`. Generated output is reviewed in PRs, never hand-edited. Theme modes (Light/Dark) are expressed as token sets mapped through **semantic** names; value-named tokens (`radius-12px`) are renamed to scale names (`radius-md`) before entering the canonical layer. Covers color, typography, spacing/radius, elevation, motion (`motion.duration.*`, `motion.easing.*`, `motion.spring.*` per `docs/standards/motion.md`).

**Interim fallback** (if Figma Variables access is unavailable during the task, per the spec assumption): build the pipeline and seed it with a **documented interim token JSON** derived from `19 — Implementation Handoff` / the committed handoff, flagged `INTERIM — reconcile against Figma Variables` so the reconciliation is tracked, not silently permanent.

**Rationale**: Exactly ADR-022. Style Dictionary is the standard multi-target token transformer and gives deterministic output; Stylelint then bans raw values outside `packages/design-tokens`.

**Alternatives considered**: Tokens Studio sync (viable add-on later); hand-authored SCSS variables (rejected — drift, ADR-022); Tailwind config as the token layer (rejected — no Tailwind).

**Verification required**: confirm Figma Variables API/export access for the token task; determinism check (same input → identical CSS); Stylelint rule proven to fail on a raw hex outside the token package.

---

## R9 — Environment model & migration release (ADR-020)

**Decision**:
- **Environments**: `local` (Docker Compose Postgres + Testcontainers for tests), `preview/CI` (ephemeral DB per run — provider branch or throwaway container), `staging` (provider DB, production-shaped, synthetic data), `production` (provider DB, PITR on). Separate secret stores per environment; no shared credentials (FR-059).
- **Migration release**: migrations run as an **explicit gated job** — a dedicated CI/release step (or a `make migrate` release action) that is separate from deploying application code and can be run and verified independently (FR-060). Application processes never auto-migrate on boot.
- **Expand → migrate/backfill → contract**: every non-trivial schema change ships as (1) additive expand (new nullable columns/tables, new policies), deployable with the old app running; (2) backfill + switch reads/writes; (3) contract (drop old) only after the old app version is fully retired (FR-061). Roll-forward is the default; no destructive-rollback assumptions for data (FR-062).
- **Migration PR checklist** (FR-063): reviewed migration file (no `drizzle-kit push` in prod), clean-DB migration test, forward-migration-from-populated test where practical, RLS/tenant-policy coverage check for any tenant-owned table touched, constraint/index impact note, expand/contract plan for non-trivial changes.

**Rationale**: Directly implements ADR-020; establishing this with only ~6 foundation tables is far cheaper than retrofitting once product tables and tenant data exist.

**Alternatives considered**: auto-migrate on deploy (rejected — ADR-020, deploy-time lock/incident risk); blue/green DB (rejected — overkill at this scale, expand/contract is sufficient).

**Verification required**: confirm the provider (R1) supports the ephemeral preview-DB strategy; write the migration release runbook in `docs/runbooks/`.

---

## Reconciliations & flagged discrepancies (feed `/speckit-analyze`)

| # | Item | Finding | Disposition |
|---|---|---|---|
| D1 | Observability package count | Issue #2 says "packages/observability" (singular); ADR/overview mandate split `observability-browser` + `observability-server` (and the hard prohibition against server observability imported into browser code). | **Follow the ADR/overview** — two packages. Issue #2 wording is looser, not conflicting. Note in analysis. |
| D2 | CSRF mechanism | ADR-007 requires CSRF protection but names no mechanism (Phase 0 review non-blocking item 1). | R6 proposes the mechanism; record as a decision record **or** a small ADR-007 amendment (founder choice). Not a conflict. |
| D3 | Scheduler selection timing | ADR-014 text says "before Recovery is built"; implementation-plan + issue #2 say "before Phase 1 exit" (Phase 0 review C1). | Plan treats it as a **Phase 1 exit** decision (stricter). Recommend the ADR-014 wording be tightened to "before Phase 1 exit" — minor, non-blocking. |
| D4 | Contract lib specifics | ADR-013 defers the concrete Nest/Zod/OpenAPI integration to "Phase 1". | R4 recommends a concrete stack; final pick in the decision record. No conflict. |
| D5 | PostgreSQL major | `research-basis.md` allows a non-18 major if the provider requires it. | R1/R2 honor this; the decision record records any deviation. No conflict. |
| D6 | First-party password auth | Some earlier spec drafting assumed first-party email+password; **superseded** by the 2026-09-08 clarification (adapter-based, no bespoke password infra). | Spec already updated. No open conflict. |

**No hard conflict with any accepted ADR was found.** All items are either direct implementations of an ADR, explicitly-deferred choices the ADR left to Phase 1, or looser issue-text that the ADR supersedes.
