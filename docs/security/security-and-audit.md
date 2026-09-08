# Security & Audit Baseline

Slotnova handles customer, staff, scheduling, payment-context and business-operational data. Security boundaries must exist from the beginning.

## Core principles

- deny cross-workspace access by default
- authenticate at the platform boundary; authorize at the use-case/domain boundary
- never trust client-supplied workspace/role claims without server verification
- validate all external input at system boundaries
- keep provider credentials server-side only
- least privilege for roles, integrations and CI credentials
- no secrets in Git, logs, analytics payloads or client bundles

## Authorization

Model authorization with workspace membership plus explicit role/permission checks. Avoid scattered UI-only permission logic. The server is authoritative.

High-consequence actions include cancellation, price override, refund, inventory correction, permission changes, recovery completion and settings changes.

## Audit events

Audit records should include, as applicable:

```text
actorId
workspaceId
action
entityType/entityId
timestamp
requestId/traceId
relevant before/after or reason metadata
```

Audit data is append-oriented. Do not use ordinary application logs as the only audit trail.

## Payments

Slotnova should minimize payment-card scope. Provider tokens/references are stored instead of raw card data. Payment provider integration must remain behind a typed adapter and be designed for idempotent commands/webhooks.

## PII

Classify personal data fields and define retention/deletion/export rules before production use. Avoid copying PII into broad analytics/logging systems.

## Web security baseline

- secure cookies where cookies are used
- CSRF protection where relevant to auth/session model
- CSP and standard security headers
- strict CORS allowlist
- rate limits on abuse-sensitive endpoints
- upload/type/size validation for file boundaries
- dependency and secret scanning in CI

## Supply chain

Pin supported runtime/package-manager major versions, use lockfiles, review dependency additions, and automate vulnerability scanning. Do not auto-apply major dependency upgrades directly to `main`.

## Incident readiness

Before production, define at minimum: credential rotation, session revocation, provider-key rotation, audit access, backup/restore verification and incident contact/runbook ownership.
