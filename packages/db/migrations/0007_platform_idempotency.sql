-- platform module: idempotent_requests (Phase 2 PR-02A, issue #61). Ownership:
-- this migration belongs to apps/api/src/modules/platform/idempotency
-- (packages/db defines no domain schema itself, ADR-004).
--
-- Durable, provider-neutral HTTP mutation-idempotency primitive. Deliberately
-- generic: it knows nothing about Catalog/Booking/Payments -- only an
-- opaque `operation` scope string, a caller-supplied `idempotency_key`, and a
-- canonical request fingerprint (apps/api/src/modules/platform/idempotency/
-- request-fingerprint.ts). Catalog PR-02 is the first consumer, not the owner.
--
-- Tenant-ownership: tenant-owned -- RLS ENABLE + FORCE + a workspace-predicate
-- policy (ADR-008), same NULLIF(...)::uuid fail-closed pattern as
-- 0002_identity.sql / 0006_catalog.sql.
--
-- Uniqueness scope (workspace_id, operation, idempotency_key) is the natural
-- boundary: the same client-supplied key must not collide across unrelated
-- operations or across tenants. This same unique index is also the entire
-- concurrency-control mechanism (apps/api/src/modules/platform/idempotency/
-- idempotent-execution.ts): a concurrent duplicate's INSERT blocks on
-- PostgreSQL's own conflict resolution until the first transaction commits
-- or rolls back, then deterministically sees either nothing (free to claim)
-- or the first transaction's committed, fully-completed row (replay).
--
-- Supported model (correctness repair, issue #61 independent review): a row
-- is inserted and later updated with its response ONLY within the same
-- caller transaction that runs the protected business mutation -- there is
-- no code path that commits a claim without also having completed it. An
-- earlier revision additionally supported committing a claim separately
-- from its completion, with a lease/expiry column for reclaiming an
-- abandoned one; that capability was removed for having an unsafe
-- completion-fencing gap (a caller that lost its claim to a reclaimer could
-- still overwrite the reclaimer's result). No replacement lease mechanism
-- exists in this table; a future consumer whose business mutation cannot
-- fit in one database transaction needs its own separately reviewed design,
-- not an extension of this one.
--
-- Retention: no periodic cleanup job ships in this PR (not required for
-- correctness). `created_at` bounds age for a future maintenance task,
-- mirroring the outbox's own current/prior state (retention added later,
-- apps/worker/src/scheduler/jobs/outbox-retention.ts) -- no speculative index
-- is added for a cleanup query that does not exist yet.
--
-- Grants follow least privilege: only INSERT/SELECT/UPDATE are granted to the
-- app role (no DELETE -- there is no delete path; a future retention job
-- would be reviewed and granted separately when it exists).

CREATE TABLE IF NOT EXISTS public.idempotent_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid        NOT NULL REFERENCES public.workspaces (id),
  operation             text        NOT NULL,
  idempotency_key       text        NOT NULL,
  -- sha256 hex digest of the canonical request (request-fingerprint.ts) --
  -- never the raw request body, so no request payload is durably retained
  -- merely to support comparison.
  request_fingerprint   text        NOT NULL,
  -- NULL only transiently, between this row's claiming INSERT and its
  -- completing UPDATE, both within one still-open, not-yet-visible
  -- transaction (idempotent-execution.ts). Every row any OTHER transaction
  -- can ever observe already has all three of these fields populated
  -- together -- enforced structurally by the code, and the CHECK below
  -- proves the fields are at least mutually consistent (never a partial
  -- write).
  response_status       integer     NULL,
  response_body         jsonb       NULL,
  response_content_type text        NOT NULL DEFAULT 'application/json',
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz NULL,
  CONSTRAINT idempotent_requests_operation_not_blank CHECK (btrim(operation) <> ''),
  CONSTRAINT idempotent_requests_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT idempotent_requests_fingerprint_shape CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT idempotent_requests_response_status_range
    CHECK (response_status IS NULL OR (response_status >= 100 AND response_status < 600)),
  CONSTRAINT idempotent_requests_completion_fields_consistent CHECK (
    (response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (response_status IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT idempotent_requests_workspace_operation_key_key
    UNIQUE (workspace_id, operation, idempotency_key)
);

ALTER TABLE public.idempotent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotent_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotent_requests_workspace_isolation ON public.idempotent_requests
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.idempotent_requests TO slotnova_app;
  END IF;
END
$$;
