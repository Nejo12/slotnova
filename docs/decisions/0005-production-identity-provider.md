# 0005 — Production Identity Provider (R5)

Status: **Not required for Phase 1 exit — explicit deferral note, pending founder review.** Per T084's accept criteria ("if not [selected] — explicit recorded note; FR-033e, FR-069a, SC-013"). Written as part of PR-20's T090/T091 documentation reconciliation; founder acknowledgment of this deferral is outstanding and must be obtained before T084 is checked complete in `tasks.md`.

## Decision

Phase 1 does **not** select or implement a real/production external identity provider. This is a deliberate, already-recorded deferral, not an oversight:

- `specs/001-platform-foundation-shell/spec.md`'s Out-of-Scope section: "Bespoke password-hashing / credential-storage / login UI infrastructure; multi-factor authentication; single-sign-on; and production external identity-provider integration. The ADR-007 credential adapter boundary is built and exercised through a development credential adapter; a production provider is a bounded exit decision only if required (FR-033e, FR-069a) and does not change the Slotnova-owned session/authorization model."
- `docs/runbooks/deployment.md`: "Hosted API requires ... `API_CREDENTIAL_ADAPTER=disabled`. The development credential adapter is forbidden. **Production sign-in remains disabled until the separately approved real identity-provider adapter exists**; this foundation does not select or implement R5."

## Why this is safe to defer, not a gap

ADR-007's credential-adapter port (`apps/api/src/modules/identity/infrastructure/credential-adapter/port.ts`) already fully decouples "how a credential was verified" from Slotnova's own session/workspace-context/authorization/RLS model. `apps/api/src/modules/identity/__tests__/adapter-parity.int.test.ts` (T039, SC-016) proves the development adapter (`dev-adapter.ts`) and a production-shaped adapter double (`__tests__/production-shaped-adapter.double.ts`) traverse **identical** session-issuance, workspace-context, authorization and RLS code paths — no path skips workspace context or RLS regardless of which adapter verified the credential, and provider role claims never become the authorization source of truth.

This means: plugging in a real provider (Auth0, Clerk, Cognito, etc., or a bespoke SSO integration) later is additive work behind the existing port — it does not require revisiting the session/authorization/RLS model this Phase 1 foundation ships. `apps/api/src/config/environment-config.ts` already enforces that a hosted/production deployment cannot use the development adapter (`API_CREDENTIAL_ADAPTER=disabled` is required, verified by `__tests__/environment-config.test.ts`), so there is no risk of the dev adapter accidentally reaching production before a real provider is selected — the configuration boundary fails closed, not open.

## Trigger for revisiting

A production identity-provider decision becomes necessary only when Slotnova actually needs to accept real production sign-ins — i.e., at or before the point a real deployment target is provisioned (see `docs/decisions/0001-hosting-postgres-provider.md`, which itself provisions nothing yet and states "no provider resource was provisioned, no hosted database was tested"). Until then, this deferral stands.

## Evidence

- `apps/api/src/modules/identity/infrastructure/credential-adapter/port.ts` — the adapter interface.
- `apps/api/src/modules/identity/infrastructure/credential-adapter/dev-adapter.ts` (+ `__tests__/dev-adapter.test.ts`) — the only adapter implementation shipped in Phase 1.
- `apps/api/src/modules/identity/__tests__/adapter-parity.int.test.ts` — proves session/context/RLS-path equivalence between the dev adapter and a production-shaped double (SC-016).
- `apps/api/src/config/environment-config.ts` (+ `__tests__/environment-config.test.ts`) — enforces the dev adapter cannot be enabled in a hosted/production configuration.
- `docs/runbooks/deployment.md` — states production sign-in remains disabled until a real provider is approved.
