# Phase 3 Implementation Plan

## Architectural shape

Phase 3 extends the existing modular monolith with three supporting modules under `apps/api/src/modules`: Clients, Notifications and Messaging. Cross-module reads/writes go through application ports. No module may import another module's repository or schema.

### Clients

Owns client records and communication-eligibility inputs. It is the source of truth for whether a client/channel is eligible in principle. It does not dispatch notifications.

### Notifications

Owns transactional notification intents, template/version boundary, delivery attempts, provider abstraction, throttling/quiet-hour scheduling decisions and retry state. It consumes Clients eligibility via a port and uses existing outbox + pg-boss infrastructure.

### Messaging

Owns human conversation threads and messages. It may link to a source notification but does not reuse notification delivery-attempt persistence or provider retry semantics.

## Persistence sequence

1. Clients tables + RLS + isolation tests.
2. Add nullable Booking↔Client association through Booking-owned migration/integration.
3. Notifications intent/template/attempt persistence + RLS.
4. Messaging thread/message persistence + RLS.
5. Cross-domain seam tables/columns only where the concrete flow requires them.

Every migration is additive. Existing Booking rows require no fabricated backfill.

## Contract strategy

Runtime schemas remain authoritative. Each implementation PR that adds an HTTP surface must:
- define request/response schemas at the API boundary;
- generate OpenAPI;
- regenerate `@slotnova/contracts`;
- run contract drift/breaking checks;
- use RFC 9457 problem responses.

## Worker strategy

- Transactional side effects enter durable state in the same transaction as the business decision where required.
- Existing outbox carries cross-process events.
- Existing pg-boss scheduler/worker owns delay/retry execution.
- Notification worker dispatch is at-least-once safe.
- Provider idempotency token derives from durable attempt identity where supported.
- No second queue library.

## Frontend strategy

Routes align with approved IA:
- Clients is a primary mobile tab.
- Messaging lives under More on mobile.
- TanStack Query keys are workspace-scoped.
- No separate client cache in router state.
- Forms preserve input on recoverable errors.
- Deliberate ≤400px compositions, Light/Dark, reduced motion and non-color status affordances are mandatory.

## Testing strategy

- Unit tests for policy functions and state transitions.
- Real PostgreSQL integration tests for RLS, FK/workspace integrity, idempotency and concurrency.
- Worker integration tests for duplicate execution and retry/failure semantics.
- Contract generation/determinism checks.
- Playwright user journeys for Clients, notification-visible states where operator-facing, Messaging and reply seam.
- axe + keyboard tests and targeted visual regression where repository policy requires.

## Planning assumptions to preserve

- No automatic client merge.
- No public external customer actor in Phase 3 unless a later bounded issue explicitly adds one.
- Notification channels may be modeled generically at the domain boundary, but only test/fake provider adapters are required in Phase 3.
- Quiet-hour timezone comes from explicit Client/workspace policy data, never browser local time.
- Frequency-cap window/count policy is explicit data, not hard-coded provider behavior.
