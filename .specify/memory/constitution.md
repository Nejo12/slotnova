# Slotnova Engineering Constitution

Version: 1.0.0
Status: Proposed — becomes effective when Phase 0 is approved and merged

## Principle I — Product truth is explicit

GitHub specifications/ADRs are the machine-readable behavioral authority. Approved Figma is the visual/interaction authority. Agents must not invent missing behavior. When Figma tooling cannot expose a referenced page, use the committed product handoff/specification and surface any unresolved visual ambiguity rather than guessing.

## Principle II — Correctness lives at the strongest boundary

Business invariants must be enforced at the strongest practical layer: database constraints/RLS for data integrity and tenant isolation, domain/application state machines for business transitions, and tests for both. UI checks alone are never correctness boundaries.

## Principle III — Modular monolith, bounded ownership

Slotnova starts as a modular monolith. Cross-domain access occurs through explicit application ports/contracts, never by importing another domain's repository or tables. Microservices require evidence and a new ADR.

## Principle IV — Multi-tenant, time-safe and money-safe by construction

Tenant isolation is database-enforced. Scheduling uses explicit instant/local-date/local-time/timezone/duration semantics and half-open intervals. Money uses integer minor units with explicit currency and deterministic allocation. Raw floating-point money and timezone-naive scheduling are prohibited.

## Principle V — Tests prove behavior, not implementation trivia

Every changed invariant receives automated coverage at the lowest trustworthy layer. PostgreSQL-specific correctness uses real PostgreSQL. Concurrency tests use real concurrent connections. Critical user journeys use Playwright. Accessibility is a release gate. Tests must never be weakened merely to make a change pass.

## Principle VI — Simple architecture over speculative abstraction

Use full domain ceremony only for invariant-heavy core modules. Apply the rule of three before extracting shared abstractions. No generic dumping-ground packages, universal base services, generic repositories, or helper layers without demonstrated repeated need.

## Principle VII — AI agents are contributors, not authorities

Agents read `AGENTS.md`, relevant ADRs/specs and the linked issue before changing code. Spec Kit owns canonical feature specifications/plans; Superpowers may guide execution discipline. Competing agent-generated plans do not become authority unless reconciled into the canonical artifacts. Agents never auto-merge; founder performs final merges.

## Governance

Authority order:

1. Founder-approved product decisions and current GitHub `main`
2. Accepted ADRs + committed architecture/product specifications
3. Approved Figma for visual/interaction detail
4. Linked feature specification and GitHub issue
5. Implementation plan/PR
6. Tests as executable evidence of accepted behavior

If two higher-order authorities conflict, stop and reconcile before implementation.

Architecture-changing work requires an ADR. Accepted ADRs are immutable history; supersede them with a new ADR rather than rewriting rationale silently.

Phase 0 must be explicitly approved before application implementation begins. No agent, CI system or automation may auto-merge a PR.
