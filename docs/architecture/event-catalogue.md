# Domain Event Catalogue

Authority: ADR-005 (Transactional Outbox), ADR-024 (Event Catalogue & Versioning),
`specs/001-platform-foundation-shell/data-model.md` ("OutboxRecord").

This catalogue tracks every event that crosses a module/process boundary
through the platform transactional outbox (`public.outbox_records`,
`apps/api/src/modules/platform/outbox/outbox-writer.ts`). Once an event is
listed here it is a contract: consumers may depend on its shape, and an
incompatible payload change requires a new `event_version`, not an in-place
edit.

## Record shape

Every outbox row carries:

| Field | Notes |
|---|---|
| `id` | stable row id |
| `workspace_id` | nullable — set for tenant-scoped events, null for platform-level events |
| `event_name` | the stable name below |
| `event_version` | starts at `1`; additive fields do not require a bump, incompatible changes do |
| `payload` | versioned JSON; **must** include `requestId` for correlation; PII-minimized |
| `occurred_at` / `available_at` | timestamps; `available_at = occurred_at` here — delay is the scheduler's job (ADR-014), not the outbox's |
| `claimed_at` / `claimed_by` / `processed_at` / `attempts` / `dead_lettered_at` | worker-claim bookkeeping (PR-16, not yet consumed) |

## Versioning policy (ADR-024)

- Prefer additive payload changes (new optional fields) over breaking ones.
- An incompatible payload change ships as a new `event_name` version bump
  (`event_version + 1`); consumers get an explicit, intentional transition
  window rather than a silent shape change.
- Internal in-process events that never cross a module boundary are **not**
  listed here and may evolve freely with their module.

## Phase 1 identity events

| Event | Version | PII-minimized payload |
|---|---:|---|
| `invitation.issued` | 1 | `requestId`, `invitationId`, `role` |
| `invitation.accepted` | 1 | `requestId`, `invitationId`, `membershipId` |
| `membership.created` | 1 | `requestId`, `membershipId`, `role` |

These producers use the existing PR-05 `writeOutboxRecord` transaction
writer. No delivery, retry, scheduler, or consumer behavior is implied here;
the first real consumer remains PR-16. The writer integration test's inert
`platform.widget_created` name is test-only and is not a catalogue event.
