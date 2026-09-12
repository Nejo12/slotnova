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

## Phase 1 (PR-05) status

**No event names are catalogued yet.** This PR (T019–T024) ships only the
platform outbox table and the transactional writer
(`writeOutboxRecord`) — the minimal, generic persistence primitive later
feature code writes through. It has no producer of its own: the writer's
integration test (`apps/api/src/modules/platform/outbox/__tests__/writer.int.test.ts`)
exercises atomicity with an inert, test-only `platform.widget_created`
event name against a test-only fixture table, and that name is **not** a
real catalogue entry — it must never be emitted by application code.

Real producers arrive with the identity module (PR-07/PR-10, e.g.
`invitation.accepted`, `membership.created`) and are added to this table
when they ship, each using the existing writer from this PR — no new outbox
implementation. The first real consumer is the outbox worker (PR-16,
ADR-014).
