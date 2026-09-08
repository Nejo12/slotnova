# Quickstart — Validating the Platform Foundation

How to prove Phase 1 works end to end. This is a **validation guide**, not implementation. Commands are illustrative names finalized during implementation (`tasks.md`); the *checks* they perform are the contract.

## Prerequisites

- The pinned toolchain from the version-pin decision record (`docs/decisions/0002-version-pins.md`): Node LTS (see `.nvmrc`), `pnpm` (see `packageManager`), a container runtime (Docker/Podman) for real-PostgreSQL tests.
- A clean checkout of the branch, no prior `node_modules` or caches.

## 1. Bootstrap (US1 / FR-010 / SC-001)

```
pnpm install
pnpm build          # Turborepo builds every workspace unit
pnpm typecheck      # strict TS, no escape hatches (FR-004)
pnpm lint           # ESLint + Stylelint token rules (FR-005)
pnpm test           # fast lane: unit + property + changed component tests
```

**Expected**: all succeed on a cold cache with no manual patching. Re-running `pnpm build` reuses cache for unchanged packages.

## 2. Run the three apps locally

```
pnpm dev:db         # starts local PostgreSQL (compose) + applies migrations via the gated runner
pnpm dev:api        # NestJS + Fastify on :3001 — GET /healthz returns { status: "ok" }
pnpm dev:worker     # outbox consumer + scheduler loop
pnpm dev:web        # Vite SPA on :3000 — the shell loads
```

**Expected**: `GET http://localhost:3001/healthz` → `200 {"status":"ok",...}`; `GET /readyz` → `200` with `database: ok`, `migrations: current`; the web shell renders the desktop navigation and, at a mobile viewport, `Home · Calendar · Clients · Recovery · More`.

## 3. Shell accessibility & theming (US3 / SC-006 / SC-007)

```
pnpm test:a11y                 # axe over shell nav, workspace switcher, shell dialogs
pnpm storybook -w packages/ui  # system-state stories render in Light + Dark
```

Manual: keyboard-only pass over shell navigation + workspace switcher (visible focus, logical order); open a shell drawer/dialog → focus trapped, Escape closes, focus restored; set OS reduced-motion → shell transitions degrade, no info lost.

## 4. Tenant isolation & session spine (US2 / SC-003 / SC-004 / SC-016)

```
pnpm test:integration:isolation   # Testcontainers real PostgreSQL
```

**Expected assertions**:
- Every tenant-owned table (`locations`, `memberships`, `invitations`, `audit_records`) has RLS enabled + FORCE + a policy (SC-003).
- With `app.workspace_id` = workspace A, every read/write against a workspace-B row is denied — even when the query omits a `workspace_id` filter (FR-029).
- The dev credential adapter and the production-shaped adapter double drive **identical** session/context/authz/RLS code paths (SC-016).
- Sign-out revokes the session server-side; replaying the old cookie → `401 session-invalid`.
- `audit_records` cannot be `UPDATE`d or `DELETE`d by the application DB role (FR-032).

## 5. Invitation flow (FR-033b / SC-018)

```
pnpm test:integration:invitations
```

**Expected**: valid token → membership with exactly the invited role + audit row + outbox rows, session rotated; expired/used/revoked token → refused, no membership change; replay of a used token → no second/elevated membership.

## 6. API contract pipeline (US4 / SC-008)

```
pnpm contracts:generate   # boundary schemas → OpenAPI → packages/contracts (client/types/MSW)
pnpm contracts:check      # fails if committed artifacts differ from a fresh generation
```

**Expected**: `contracts:generate` is byte-identical on unchanged input; hand-editing a generated file makes `contracts:check` fail; the SPA imports the generated client (never a backend entity); a forced error on each endpoint returns a valid `application/problem+json` body.

## 7. Async spine (US5 / SC-009 / SC-010)

```
pnpm test:integration:outbox-writer   # writer atomicity (built in the platform foundation, PR-05)
pnpm test:integration:outbox          # consumer: at-least-once, crash/restart, idempotent handlers
pnpm test:concurrency:outbox          # two real workers, no double-processing
pnpm test:integration:scheduler       # delayed job runs once after delay; survives restart; DLQ on repeated failure
```

**Expected**: business write + outbox row are atomic (rollback hides both); killing the worker mid-batch and restarting causes no lost/duplicated effect; two concurrent workers never process the same record/job; a repeatedly failing job lands in the parked/dead-letter state within its bound.

## 8. Migrations & environments (US6 / SC-011)

```
pnpm db:migrate:clean       # all migrations on an empty DB → expected schema incl. RLS/policies
pnpm db:migrate:forward     # migrations onto a representative populated DB → no data loss
pnpm db:migrate --help      # confirms migration is a standalone gated step, not app-startup
```

## 9. Observability (US7 / SC-012)

```
pnpm test:integration:observability
```

**Expected**: a request with no correlation id gets one, and it appears in every structured log line for that request and in the logs/telemetry of any job it triggers; a request with a supplied id preserves it; a test asserts a domain/telemetry event was emitted with no network access; a sampled log/trace audit finds no configured sensitive field.

## 10. E2E journeys (SC-017)

```
pnpm e2e   # Playwright
```

**Expected passing**: sign-in smoke; **journey 6** — switch workspace A→B, no workspace-A data visible; **journey 7** — a `staff`-role user is denied a `members:invite` action server-side (not just a hidden button). The harness can open a second isolated browser context.

## 11. CI gates (SC-002 / SC-005)

- Open a PR with a deliberate type error, a raw hex color outside `packages/design-tokens`, and a cross-module repository import → the **fast lane fails** naming each rule + location.
- Fast lane completes under 3 minutes on warm cache; heavy lane runs before merge; no auto-merge is configured.
- The **observed heavy-lane duration** is recorded as a baseline in `docs/runbooks/perf-baselines.md`, and the **founder-agreed heavy-lane pre-merge time budget** is recorded in `docs/standards/ci-quality-gates.md` before Phase 1 exit; the heavy lane then completes within that recorded budget (SC-002).

## 12. Phase 1 exit decision records (US8 / SC-013)

Confirm each exists, cites evidence + rejected alternatives, and is ADR-consistent (or paired with an ADR-change proposal):

- `docs/decisions/0001-hosting-postgres-provider.md`
- `docs/decisions/0002-version-pins.md`
- `docs/decisions/0003-job-scheduler.md`
- `docs/decisions/0004-validation-contract-integration.md`
- `docs/decisions/0006-csrf-mechanism.md` (or an ADR-007 amendment)
- `docs/decisions/0005-production-identity-provider.md` **or** an explicit exit-checklist note that a production provider is not required for Phase 1 exit.
- `docs/standards/ci-quality-gates.md` records the founder-agreed heavy-lane pre-merge budget (CI-1); `docs/runbooks/perf-baselines.md` records the observed baseline.
- `docs/decisions/0007-client-only-state.md` — only if Zustand was introduced (FR-014); otherwise no artifact is required.

## Definition of done for Phase 1

All of the above pass, `SC-001`…`SC-018` are demonstrably met, a reviewer confirms **no product-domain behavior** is present (SC-014), and the work merged as a sequence of bounded PRs (SC-015) — founder performs each merge.
