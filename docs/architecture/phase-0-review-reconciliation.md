# Phase 0 Independent Review — Reconciliation Record

Date: 2026-09-08
Reviewer: independent Claude Code architecture review
Status: Reconciled in progress; this document records disposition, not implementation authorization.

## Verification correction — Figma

The review reported that file `WDH7Ku5JXhUQeJ054GFLPd` contained only `00 — Cover`. That was a **tooling false negative**, not a missing design corpus.

Re-verification through the Figma Plugin API returned **61 top-level pages**, including:

- `07 — Booking`
- `09 — Waitlist & Recovery`
- `10 — Messaging`
- `11 — Payments & POS`
- `13 — Inventory`
- `16 — Settings`
- `18 — Prototypes` (`3:21`)
- `19 — Implementation Handoff` (`372:2`)

Generic metadata for the same file can expose only the cover page. Therefore the review's recommendation to remove claims that those designs exist is **rejected**. The underlying AI-risk finding is **accepted**: agents with incomplete Figma access must not invent UI behavior. GitHub's committed product handoff/specifications are now the machine-readable behavioral authority; Figma remains visual/interaction authority.

## Blocker findings

| Finding | Disposition | Resolution |
|---|---|---|
| B1 Figma source unreadable | Modified | Corpus verified via Plugin API; docs now explain API discrepancy and fallback authority. |
| B2 constitution/template missing | Accepted | Real `.specify/memory/constitution.md` added and versioned. Third-party generated agent skills are not vendored by default. |
| B3 authentication/session model missing | Accepted | ADR-007 added; secure server-managed cookie sessions, provider-neutral identity boundary. |
| B4 tenancy only by convention | Accepted | ADR-008 + security/domain docs require PostgreSQL RLS, transaction tenant context, scoped repositories and isolation tests. |
| B5 booking overlap race | Accepted | ADR-011 + domain docs require PostgreSQL exclusion constraint over blocking intervals. |
| B6 Catalog context missing | Accepted | ADR-012 adds Catalog ownership; overview/domain map updated. |
| B7 time library/storage unresolved | Accepted with modification | ADR-010 chooses Temporal semantics via polyfill until intentional native adoption; `timestamptz` + IANA zone + local recurrence; `[start,end)`. |
| B8 outbox conflated with scheduler | Accepted | ADR-005 corrected; ADR-014 separates Postgres-backed scheduler. Phase 1 benchmarks graphile-worker vs pg-boss before selection. |

## High-priority findings

| Finding | Disposition | Resolution |
|---|---|---|
| Public offer-acceptance attack surface | Accepted | ADR-018 + security/domain rules: unguessable tokens, POST-only mutation, expiry recheck, rate limits. |
| Consent/quiet hours/frequency cap | Accepted | ADR-017 + security/domain rules; Notifications is enforcement boundary. |
| Recovered revenue definition/reversal | Accepted | ADR-016/domain docs split booked vs realised and require explicit reversal/transition. |
| Tax/allocation model | Accepted | ADR-015 adds currency exponent, largest-remainder allocation and explicit tax configuration. |
| Settings is not a domain | Accepted | ADR-012 dissolves backend Settings context; remains UI composition. |
| Analytics coupling | Accepted | ADR-012 makes Analytics an event-fed read model with own tables. |
| Scheduling vs Calendar | Accepted | ADR-012/overview split core Scheduling from UI Calendar. |
| Notifications vs Messaging | Accepted | ADR-012 adds Notifications as supporting domain. |
| Module tiering | Accepted | ADR-012 + AGENTS constitution enforce core/supporting/generic tiers and rule of three. |
| Workspace-scoped Query cache | Accepted | ADR-003/overview/AGENTS require workspace-scoped keys and cache clear on switch/logout. |
| Generated tenant tests | Accepted | ADR-008/testing/CI require cross-tenant isolation suite. |
| Storybook as app | Accepted | Storybook moved conceptually into `packages/ui`. |
| Central business schema package | Accepted | Per-module Drizzle schema ownership; `packages/db` only client/migrations/test harness. |
| React Router mode ambiguous | Accepted | ADR-003 resolves to Vite SPA + data router; TanStack Query owns remote state. |
| API contract direction | Accepted with modification | Runtime HTTP boundary schemas generate OpenAPI; OpenAPI generates client/types/MSW. Domain models are not shared to frontend. |
| CI runtime growth | Accepted | Fast/heavy lanes, target fast lane <3 min, Turborepo caching in Phase 1. |
| Deployment/migration topology | Accepted as open pre-Phase-1 decision | ADR-020 to define environments/deployment/expand-contract policy before Phase 1 exit. |
| Optimistic concurrency | Accepted | Domain modeling requires version checks for user-editable aggregates where concurrent edits are plausible. |
| GDPR erasure vs immutable records | Accepted | ADR-019 defines retention/pseudonymization strategy. |
| Recovery kill switch | Accepted | Domain/security docs require workspace/global outbound kill controls before broad rollout. |
| Audit append-only DB enforcement | Accepted | Security/domain docs require DB privilege enforcement. |
| Barrel files/style raw tokens | Accepted | AGENTS/CI prohibit dependency-hiding barrels and enforce raw style/motion value rules. |
| Figma → code token pipeline | Accepted | ADR-022 required before generated token package is built. |
| Generic resource/capacity model | Deferred | Preserve extension seam in Scheduling/Booking design; do not generalize staff into universal resource prematurely. |
| Client dedupe/merge | Deferred but planned | Clients owns future dedupe/merge; schema must avoid assumptions that make merge impossible. |

## Challenges accepted against previous docs

- `Settings` and `Calendar` are product surfaces, not backend bounded contexts.
- Analytics is a downstream read model, not a peer domain that cross-queries operational tables.
- Recovery is a process manager across explicit ports and does not own other modules' persistence.
- Storybook is colocated with the UI package.
- Drizzle business schema is owned per backend module.
- Motion for React is not required in the Phase 1 shell bundle; CSS carries simple shell motion and richer motion is introduced intentionally.

## Decisions retained

The review explicitly validated and this reconciliation retains:

- modular monolith
- pnpm + Turborepo
- NestJS + Fastify
- PostgreSQL + Drizzle
- no initial Kafka/microservices
- integer-money model
- explicit temporal concepts
- transactional outbox
- real PostgreSQL/Testcontainers tests
- fast-check for invariant-heavy logic
- accessibility as a release gate
- manual founder merge; no auto-merge
- Recovery distinct from Retention

## Remaining Phase 0 work

Before the gate can be marked READY:

1. finalize/approve proposed ADRs after founder review
2. add/approve deployment, frontend token-pipeline, analytics/event-versioning ADRs
3. verify/update implementation plan and issue graph against final domain map
4. run Spec Kit analysis/checklist against the reconciled artifacts
5. sync local Spec Kit project files safely with the committed constitution
6. perform a final independent consistency review (read-only)
7. founder explicitly approves and manually merges PR #10
