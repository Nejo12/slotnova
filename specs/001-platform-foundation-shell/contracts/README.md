# Phase 1 API Contract Surface

**Purpose**: the *only* HTTP endpoints Phase 1 exposes. Everything here is a **boundary contract description** — request/response shapes, status codes, error semantics — not implementation. At implementation time these become runtime boundary schemas (R4) that generate the OpenAPI document and the `packages/contracts` client/types/MSW artifacts (ADR-013, FR-034–FR-039).

## Rules that apply to every endpoint

- **Transport**: JSON over HTTPS. Server-managed session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` where topology permits).
- **CSRF**: every state-changing request (`POST`/`PUT`/`PATCH`/`DELETE`) requires a valid double-submit CSRF token + same-site `Origin`/`Sec-Fetch-Site` (research R6). Safe methods are side-effect-free — **no state-changing GET** (hard prohibition).
- **Errors**: always `application/problem+json` (RFC 9457) — see [`problem+json.contract.md`](./problem+json.contract.md). Never leak server-internal domain/persistence types (FR-035).
- **Correlation**: every response carries the request correlation id; a supplied `X-Request-Id`/`traceparent` is honored, otherwise one is generated (FR-054).
- **Tenancy**: any endpoint touching tenant-owned data resolves the active workspace from the session and runs inside a transaction with `SET LOCAL app.workspace_id` (FR-028); RLS is the backstop.
- **Authorization**: decided server-side from session + active membership + permissions (FR-031). A missing capability returns `403` with a `problem+json` body naming the required capability.
- **Determinism**: the generated OpenAPI + client artifacts are byte-identical on unchanged boundary schemas; a stale committed artifact fails CI (FR-036, SC-008).
- **Versioning**: breaking changes require explicit versioning/deprecation (FR-038). Phase 1 endpoints are `v1`.

## Endpoints

| Method | Path | Auth | State-changing | Contract |
|---|---|---|---|---|
| GET | `/healthz` | none | no | [health](./health.contract.md) |
| GET | `/readyz` | none | no | [health](./health.contract.md) |
| POST | `/v1/auth/session` | credential adapter | yes | [session](./session.contract.md) |
| DELETE | `/v1/auth/session` | session | yes | [session](./session.contract.md) |
| POST | `/v1/auth/session/workspace` | session | yes | [workspace-context](./workspace-context.contract.md) |
| GET | `/v1/me` | session | no | [workspace-context](./workspace-context.contract.md) |
| POST | `/v1/invitations` | session + `members:invite` | yes | [invitations](./invitations.contract.md) |
| GET | `/v1/invitations/{token}` | none (token is the capability) | no | [invitations](./invitations.contract.md) |
| POST | `/v1/invitations/{token}/acceptance` | session | yes | [invitations](./invitations.contract.md) |
| PATCH | `/v1/invitations/{id}` | session + `members:invite` | yes | [invitations](./invitations.contract.md) — revoke (`{ "status": "revoked" }`) |

No other endpoints exist in Phase 1. Product endpoints (bookings, offers, payments, …) are out of scope (FR-070).
