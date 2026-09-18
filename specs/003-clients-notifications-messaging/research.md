# Phase 3 Research & Decisions

## R1 — Client identity

**Decision:** Client is a workspace-owned customer record with its own stable id. Identity users/memberships represent operators/staff access and are not reused.

**Why:** ADR-012 separates Clients from Identity; Phase-2 exit explicitly deferred the real client entity to Phase 3.

## R2 — Historical bookings

**Decision:** Add Booking↔Client as nullable/additive. Do not backfill by guessing from names, emails, operators or memberships.

**Why:** preserves Phase-2 invariants and avoids fabricated personal data.

## R3 — Contact model

**Decision:** Store Client contact channels as typed rows or equivalent structured schema owned by Clients, with normalized send/match value and display value where needed. Avoid opaque JSON as the primary domain model.

## R4 — Consent/lawful basis

**Decision:** Store factual metadata such as state, source, capturedAt, withdrawnAt, purpose/channel scope and actor/request provenance. Do not encode jurisdiction-specific legal conclusions into generic enums.

**Why:** ADR-017 requires auditable eligibility while explicitly deferring jurisdiction-specific legal review before production.

## R5 — Quiet hours

**Decision:** Represent explicit local start/end + IANA timezone. Windows may cross midnight. Notifications computes next eligible instant server-side using the existing time model.

## R6 — Frequency caps

**Decision:** Clients owns policy inputs; Notifications owns enforcement using durable dispatch history. Cap evaluation is per client + workspace + channel/purpose over a defined rolling/calendar window specified by policy.

## R7 — Notification template boundary

**Decision:** Notifications owns stable template key + version and renders provider-neutral content. Producers pass typed domain inputs. Provider adapters receive rendered channel content, not business-domain objects.

## R8 — Notification durability

**Decision:** Persist one notification intent and separate delivery attempts. Duplicate producer requests resolve to the same intent by idempotency key. Worker retries create/update attempt state deterministically rather than duplicate intents.

## R9 — Outbox vs scheduler

**Decision:** Reuse both existing mechanisms for their intended responsibilities: outbox for durable cross-boundary publication, pg-boss/job scheduler for delayed/retry execution. Delay is not encoded by mutating outbox semantics.

## R10 — Messaging separation

**Decision:** Conversation/thread/message tables live under Messaging. Notification rows may store a nullable conversation reference or a dedicated seam relation, but delivery attempts are never imported into message history.

## R11 — Participants

**Decision:** Phase 3 starts with workspace operators plus a Client reference as the external conversation counterpart where the implemented flow requires it. No public authenticated-client account model is introduced.

## R12 — Rebooking

**Decision:** Clients UI may launch rebooking with client context, but Booking remains authoritative for booking creation. Rebooking is not Recovery and does not rank/offers capacity.

## R13 — Permissions

**Decision:** Introduce explicit module capabilities and test them directly. Do not silently resolve the deferred default role→capability mapping.

## R14 — Privacy/retention

**Decision:** Separate mutable client profile/contact data from audit/delivery facts; design for pseudonymization/erasure per ADR-019; minimize PII in outbox/event payloads.

## R15 — Figma access

Generic metadata access on 2026-09-18 exposed only `00 — Cover`. The committed handoff states Plugin access previously verified the full 61-page corpus. This planning package therefore uses committed behavioral authority and records visual verification as an implementation-time requirement rather than inventing absent design detail.
