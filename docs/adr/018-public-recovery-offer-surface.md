# ADR-018 — Public Recovery Offer Surface

Status: Proposed

## Context

Recovery offers are opened by clients who may have no Slotnova account. The link is therefore an unauthenticated capability that can mutate booking state if handled incorrectly. Messaging/email clients commonly prefetch links.

## Decision

Offer URLs carry high-entropy, non-enumerable, short-lived tokens. GET renders offer information only. Accept/decline operations require an explicit state-changing request (POST or equivalent) after user action. Acceptance revalidates token/state/expiry/eligibility inside the transaction and is replay/idempotency safe. Public responses minimize PII and are aggressively rate-limited/audited.

## Consequences

Previews/prefetchers cannot accidentally accept offers. The public surface requires dedicated security, abuse, expiry and concurrency tests.
