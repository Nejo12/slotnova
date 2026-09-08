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
- no state-changing HTTP GET endpoints

## Authentication/session baseline

The application uses secure server-managed sessions for browser/operator access:

- `HttpOnly`, `Secure`, `SameSite=Lax` cookies
- `__Host-` cookie prefix where deployment topology permits
- server-side session revocation
- short-lived authentication/session state with explicit rotation/expiry
- CSRF protection for state-changing cookie-authenticated requests
- MFA/SSO-capable identity-provider boundary may be introduced behind an adapter, but Slotnova owns workspace memberships/roles/permissions and does not trust provider role claims as the source of authorization truth

Raw JWTs are not persisted in `localStorage` for primary browser authentication.

## Tenant isolation

Tenant isolation is defense-in-depth, not an application convention:

- PostgreSQL RLS on tenant-owned tables
- transaction-scoped tenant context (`SET LOCAL app.workspace_id = ...` or equivalent)
- tenant-scoped repository/query APIs
- no unscoped tenant query in product code
- tests asserting RLS coverage for every tenant-owned table
- generated/parameterized cross-tenant API tests
- browser QueryClient cache is cleared on logout/workspace switch and server-state keys are workspace-scoped

## Authorization

Model authorization with workspace membership plus explicit roles/permissions/policies. Avoid scattered UI-only permission logic; the server is authoritative.

High-consequence actions include cancellation, price override, refund, inventory correction, permission change, recovery completion/override, consent changes and sensitive configuration changes.

## Public recovery-offer security

The public acceptance surface is a privileged unauthenticated capability:

- high-entropy, non-enumerable tokens
- short server-authoritative expiry
- token state checked inside the acceptance transaction
- GET may render offer details but can never accept/decline/mutate
- acceptance requires explicit POST/action so link preview/prefetch cannot mutate state
- minimal PII in public responses
- strict per-token/IP/device abuse controls where appropriate
- replay/idempotency protection
- acceptance/expiry/supersede events are audited

## Consent and outbound communication

Before automated Recovery/Retention messages are sent, enforce server-side:

- documented consent/lawful-basis state
- channel preference
- opt-out/suppression
- quiet hours
- per-client/workspace frequency caps
- delivery/provider failure state

These decisions must be auditable. Product launch in a jurisdiction requires legal review of the applicable electronic-marketing rules; architecture must not assume consent is merely a UI preference.

## Audit events

Audit records include, as applicable:

```text
actorId
workspaceId
action
entityType/entityId
timestamp
requestId/traceId
relevant before/after or reason metadata
```

Audit storage is append-only at the database privilege level. The normal application role must not be able to update/delete audit rows. Application logs are not the audit trail.

## Payments

Minimize payment-card scope. Store provider tokens/references, never raw PAN/CVC. Payment/refund commands and webhooks require idempotency and monotonic/validated state transitions that tolerate duplicate and out-of-order delivery.

## PII, retention and erasure

Classify personal data fields before production. Define retention/export/erasure policy by record class.

GDPR erasure and immutable financial/audit requirements are reconciled through explicit retention and pseudonymization rules rather than naive hard-delete assumptions. Payment/legal records that must be retained are separated from optional profile/contact data and unnecessary PII is not copied into analytics/logging.

## Web security baseline

- secure cookies/session protections
- CSRF protection where relevant
- CSP and standard security headers
- strict CORS allowlist
- rate limits on auth, public offer, booking, messaging and other abuse-sensitive endpoints
- upload/type/size validation for file boundaries
- dependency, secret and static-analysis scanning in CI

## Supply chain

Pin supported runtime/package-manager majors, use lockfiles, review dependency additions and automate vulnerability scanning. Do not auto-apply major dependency upgrades directly to `main`.

## Incident readiness

Before production, define credential/session/provider-key rotation, audit access, tenant containment, outbound-notification kill switches, backup/restore verification and incident/runbook ownership.
