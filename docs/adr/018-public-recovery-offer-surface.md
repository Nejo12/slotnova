# ADR-018 — Public Recovery Offer Surface

Status: Accepted

## Context

Recovery offers are opened by clients who may have no Slotnova account. The link is therefore an unauthenticated capability that can mutate booking state if handled incorrectly. Messaging/email clients commonly prefetch links.

## Decision

Offer URLs carry high-entropy, non-enumerable, short-lived tokens. GET renders offer information only. Accept/decline operations require an explicit state-changing request (POST or equivalent) after user action. Acceptance revalidates token/state/expiry/eligibility inside the transaction and is replay/idempotency safe. Public responses minimize PII and are aggressively rate-limited/audited.

Rate limiting must work correctly for the deployed API topology. Phase 4 may use a single-instance limiter only while the public acceptance surface is guaranteed single-instance; before horizontal API scaling, use a shared limiter backed by an approved shared store. Redis is not introduced solely for this purpose without evidence; a Postgres-backed limiter is the default candidate if no other shared provider has already been accepted.

## Consequences

Previews/prefetchers cannot accidentally accept offers. The public surface requires dedicated security, abuse, expiry and concurrency tests.
