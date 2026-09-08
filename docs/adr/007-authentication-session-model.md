# ADR-007 — Authentication & Session Model

Status: Proposed

## Context

Slotnova is a multi-tenant B2B operator platform with staff logins, shared devices, future MFA/SSO needs and sensitive business actions. Browser authentication must be revocable and resistant to token theft.

## Decision

Use secure server-managed browser sessions carried in `HttpOnly`, `Secure`, `SameSite=Lax` cookies, preferring the `__Host-` prefix when deployment topology permits. The server owns session revocation/rotation and resolves workspace membership/role/permission state from Slotnova-owned data. External identity providers may supply credential/MFA/SSO capability behind an adapter, but provider role claims are never the authorization source of truth. Do not use JWTs in `localStorage` as the primary browser session mechanism.

## Consequences

Requires CSRF protection for state-changing cookie-authenticated requests and a session store/revocation strategy. Gives strong browser security, immediate revocation and clean workspace authorization boundaries.
