# Notifications Contract

Planning shape; implementation is runtime-schema-first.

## Capabilities
Read: `notifications:read`  
Request/send: `notifications:send`

## Provider-neutral request

### POST /v1/notifications
Body:
- producerKey/idempotencyKey
- clientId where applicable
- templateKey + typed template data
- channel/purpose

Server derives workspace, checks capability, loads Clients eligibility, renders provider-neutral content, persists durable intent and schedules dispatch if eligible.

Outcomes:
- 201 created/queued/deferred
- 200 same idempotent request replay
- 4xx validation/capability/domain conflict
- suppressed/ineligible is a durable business outcome, not a fake provider failure

### GET /v1/notifications/{id}
Returns intent state and safe delivery summary. Provider credentials/raw secrets are never exposed.

## Semantics
- quiet hours may yield deferred + nextEligibleAt;
- frequency cap may yield deferred or suppressed according to the explicit implemented policy;
- duplicate worker execution must not duplicate provider sends where provider/idempotency seam allows prevention;
- attempts are separate durable records;
- retryable vs terminal failure is explicit;
- notification history is not Messaging history.
