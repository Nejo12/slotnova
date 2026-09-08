# ADR-017 — Consent, Quiet Hours & Frequency Capping

Status: Proposed

## Context

Recovery and Retention send automated outbound messages. Consent/lawful basis, opt-out, channel preference, quiet hours and message frequency are not merely UI settings; they determine whether an offer may be sent.

## Decision

Clients owns communication eligibility data; Notifications enforces it before dispatch. Eligibility includes consent/lawful-basis state, channel preference, suppression/opt-out, quiet hours, and per-client/workspace frequency caps. Decisions are server-side and auditable. Jurisdiction-specific legal rules are reviewed before production launch.

## Consequences

Recovery/Marketing cannot directly call provider SDKs. They request a notification through a policy-enforcing Notifications port. This creates a reliable compliance choke point and avoids duplicated messaging policy.
