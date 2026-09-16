# 0006 — CSRF Mechanism (R6)

Status: **Documents an already-shipped, already-implemented mechanism — pending founder review of this record.** ADR-007 (Accepted) requires CSRF defense for state-changing cookie-authenticated requests but does not itself name a mechanism — this gap was flagged as research finding R6 / Phase-0-review item D2. The mechanism below was implemented as task T037 (PR-06, foundation session/CSRF work, merged before this PR) and has been in continuous use since. This record closes T083/R6 by documenting that shipped decision; it is not proposing a new mechanism or amending ADR-007's decision, since ADR-007's own text ("explicit CSRF defense using strict Origin/Referer validation plus a synchronizer/double-submit token mechanism where required") already anticipated and permits exactly this shape. Written as part of PR-20's T090/T091 documentation reconciliation; founder approval of this record itself is outstanding and must be obtained before T083 is checked complete in `tasks.md`.

## Decision

Double-submit cookie token, verified alongside strict `Origin` and `Sec-Fetch-Site` checks, enforced once at the Fastify `onRequest` boundary for every state-changing request.

Implementation: `apps/api/src/modules/platform/security/csrf.ts` (`registerCsrfProtection`, `issueCsrfCookie`) and `apps/api/src/modules/platform/security/csrf-token.ts` (`generateCsrfToken`, a pure 32-byte `crypto.randomBytes` value, base64url-encoded).

Mechanism, precisely:

1. On bootstrap/sign-in/sign-out, the server sets a CSRF cookie (`__Host-slotnova_csrf` when `secureCookies` is true, `slotnova_csrf` otherwise) with `httpOnly: false` (the SPA must read it), `sameSite: "lax"`.
2. The SPA mirrors the cookie's value into an `X-CSRF-Token` request header on state-changing requests.
3. A single Fastify hook, registered once (not opt-in per route), runs before any state-changing request reaches its handler:
   - `GET`/`HEAD`/`OPTIONS` are exempt (safe methods never mutate, so nothing here can turn a GET into a write — consistent with the repo's hard "no state-changing GET" prohibition).
   - `Sec-Fetch-Site: cross-site` is rejected outright.
   - The request's `Origin` header must be in the same allowlist CORS trusts (`SecurityConfig.corsOrigins`).
   - The CSRF cookie value and the `X-CSRF-Token` header value must both be present and must match exactly (the double-submit check).
4. Any rejection returns a `application/problem+json` `403 forbidden` body built from the same `PROBLEM_CATALOGUE`/`problem-types` helpers the rest of the API uses, with the request's correlation id as `instance` — consistent error-contract shape, not a bespoke CSRF-specific error format.

`SameSite=Lax` on the session cookie remains defense-in-depth per ADR-007's own framing; it is not the sole control — the mechanism above is.

## Evidence

- Implementation: `apps/api/src/modules/platform/security/csrf.ts`, `csrf-token.ts`.
- Contract tests: `apps/api/src/modules/platform/security/__tests__/csrf.test.ts` — 7 cases covering safe-method exemption, missing-token rejection, mismatched-token rejection, valid-token acceptance, cross-site-Origin rejection despite a matching token, and `Sec-Fetch-Site: cross-site` rejection regardless of tokens.
- Consumed by every state-changing identity endpoint (`session.controller.ts`, `invitations.controller.ts`, `workspace-context.controller.ts`, `me.controller.ts`) via `apps/api/src/modules/platform/security/security.module.ts`'s registration.
- Contract-level assertions in `apps/api/src/modules/identity/http/__tests__/session.contract.test.ts`, `invitations.contract.test.ts`, `workspace-context.contract.test.ts` confirm CSRF enforcement holds at the full-request-contract level, not only the isolated hook-unit level.

## Rejected alternatives

Not separately spiked as distinct candidates, since ADR-007 itself already named "synchronizer/double-submit token" as the accepted mechanism family — the only real decision remaining was *which* of the two, and double-submit was chosen because it requires no server-side session-keyed token store (simpler given the existing server-managed-cookie session model already in place) and composes cleanly with the existing `SecurityConfig.corsOrigins` allowlist already used for CORS.

## Disposition of Phase-0-review D2

D2 (`specs/001-platform-foundation-shell/research.md`): "ADR-007 requires CSRF protection but names no mechanism ... R6 proposes the mechanism; record as a decision record **or** a small ADR-007 amendment (founder choice). Not a conflict." — resolved via this decision record, per the founder-choice framing; no ADR-007 amendment is needed since its text already permitted this exact mechanism family.
