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
-- operations or across tenants.
--
-- State machine: 'in_progress' -> 'completed'. A row is inserted 'in_progress'
-- the instant a caller claims the key and is updated to 'completed' with the
-- replayable response once the caller's business logic finishes -- normally
-- both statements run inside the SAME database transaction as the business
-- write they guard (apps/api/src/modules/platform/idempotency/
-- idempotent-execution.ts), so a mid-transaction crash rolls back the claim
-- together with the business write and never leaves a committed 'in_progress'
-- row at all. `lease_expires_at` exists for the narrower case a future
-- consumer's business logic cannot fit in one transaction (e.g. an external
-- provider call between claim and completion): if that consumer's process
-- dies after committing the claim but before completing it, the lease bounds
-- how long the key stays unusable before another caller may reclaim it --
-- this is a documented, bounded recovery path, not a distributed-lock
-- framework.
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
  status                text        NOT NULL DEFAULT 'in_progress',
  response_status       integer     NULL,
  response_body         jsonb       NULL,
  response_content_type text        NOT NULL DEFAULT 'application/json',
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz NULL,
  -- Claim expiry for the bounded-recovery path described above.
  lease_expires_at      timestamptz NOT NULL,
  CONSTRAINT idempotent_requests_operation_not_blank CHECK (btrim(operation) <> ''),
  CONSTRAINT idempotent_requests_idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT idempotent_requests_fingerprint_shape CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT idempotent_requests_status_check CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT idempotent_requests_response_status_range
    CHECK (response_status IS NULL OR (response_status >= 100 AND response_status < 600)),
  -- A row's response fields are populated if and only if it is 'completed' --
  -- this is a genuine state invariant (proof of "durable replay", not
  -- "trust the caller populated it correctly"), not a cosmetic constraint.
  CONSTRAINT idempotent_requests_completion_fields_consistent CHECK (
    (status = 'in_progress' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (status = 'completed' AND response_status IS NOT NULL AND completed_at IS NOT NULL)
  ),
  -- The natural uniqueness boundary (workspace + operation + key) also
  -- serves as the atomic claim mechanism: a concurrent duplicate's INSERT
  -- either blocks on this constraint until the first transaction resolves,
  -- or fails with a unique-violation the caller maps to a conflict/replay
  -- decision (idempotent-execution.ts `claim()`), never both succeeding.
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
