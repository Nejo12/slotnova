-- Platform transactional outbox (ADR-005, ADR-024, data-model.md "OutboxRecord").
--
-- Written by application code in the SAME transaction as the business state
-- change it accompanies (apps/api/src/modules/platform/outbox/writer.ts) — the
-- writer never opens a second transaction and never commits on its own.
--
-- Not RLS-gated: per data-model.md's tenant-ownership matrix this table
-- "carries workspace_id as context" rather than being tenant-owned; the future
-- worker (PR-16, ADR-014) runs with an elevated role and sets tenant context
-- per-dispatch, not per-row-read. No delivery/retry/DLQ/consumer/scheduler
-- behavior is implied or added by this migration — that is apps/worker
-- (ADR-005, ADR-014), out of scope here.

CREATE TABLE IF NOT EXISTS public.outbox_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: platform-level events carry no single workspace; tenant-scoped
  -- events set this for worker dispatch context (data-model.md).
  workspace_id      uuid        NULL,
  -- Stable event name from the event catalogue (ADR-024,
  -- docs/architecture/event-catalogue.md).
  event_name        text        NOT NULL,
  event_version     integer     NOT NULL DEFAULT 1,
  -- Versioned, PII-minimized payload; carries request_id for correlation
  -- (data-model.md "OutboxRecord").
  payload           jsonb       NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  -- Equal to occurred_at for the outbox itself; scheduled delay is the
  -- separate Postgres-backed scheduler's job (ADR-014), not the outbox's.
  available_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at        timestamptz NULL,
  claimed_by        text        NULL,
  processed_at      timestamptz NULL,
  attempts          integer     NOT NULL DEFAULT 0,
  dead_lettered_at  timestamptz NULL,
  CONSTRAINT outbox_records_event_name_not_blank CHECK (btrim(event_name) <> ''),
  CONSTRAINT outbox_records_event_version_positive CHECK (event_version >= 1),
  CONSTRAINT outbox_records_attempts_non_negative CHECK (attempts >= 0)
);

-- Supports the future worker's `FOR UPDATE SKIP LOCKED` claim query
-- (ADR-005/ADR-020): unclaimed, unprocessed, not dead-lettered, ready now.
CREATE INDEX IF NOT EXISTS outbox_records_claimable_idx
  ON public.outbox_records (available_at)
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

CREATE INDEX IF NOT EXISTS outbox_records_workspace_id_idx
  ON public.outbox_records (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- Grant the RLS-subject application role (packages/db/src/testing/pg-container.ts
-- APP_ROLE, "slotnova_app" — the fixed app-role name pending the R1 hosting
-- decision record) read/write access. Guarded so this migration does not hard-fail
-- in a database where the role has not been provisioned yet; provisioning is
-- expected to run before the gated migration step in every environment.
-- Also grants read access to `schema_migrations` (owned by packages/db, not
-- this module) so `GET /readyz` can compare applied versions against the
-- migration files on disk without any elevated role (T023).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.outbox_records TO slotnova_app;
    GRANT SELECT ON public.schema_migrations TO slotnova_app;
  END IF;
END
$$;
