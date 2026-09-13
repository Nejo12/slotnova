-- audit module: audit_records (data-model.md "AuditRecord", ADR-019,
-- security-and-audit.md "Audit events"). Ownership: apps/api/src/modules/audit.
--
-- Append-only at the database-privilege level (FR-032): the app role is
-- granted INSERT + SELECT ONLY. UPDATE and DELETE are explicitly REVOKEd
-- below (they were never GRANTed either -- Postgres privileges are
-- deny-by-default -- but an explicit REVOKE documents the invariant and
-- survives a future blanket GRANT elsewhere being added carelessly).
--
-- Tenant-owned per the RLS matrix (data-model.md): RLS ENABLE + FORCE + a
-- workspace-predicate policy, same fail-closed predicate as identity's
-- tenant-owned tables (0002_identity.sql).
--
-- References public.workspaces(id)/public.users(id): a database-level FK is
-- ordinary referential integrity, not an application-code cross-module import
-- (the hard prohibition AGENTS.md guards against) -- no apps/api source file
-- in this module imports identity's schema/infrastructure.

CREATE TABLE IF NOT EXISTS public.audit_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES public.workspaces (id),
  -- Null for system actions.
  actor_user_id  uuid        NULL REFERENCES public.users (id),
  -- Stable event name, e.g. "membership.role_changed".
  action         text        NOT NULL,
  entity_type    text        NOT NULL,
  entity_id      text        NOT NULL,
  -- Before/after or reason; PII-minimized (ADR-019).
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Correlation id (FR-032, FR-054).
  request_id     text        NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_records_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT audit_records_entity_type_not_blank CHECK (btrim(entity_type) <> ''),
  CONSTRAINT audit_records_entity_id_not_blank CHECK (btrim(entity_id) <> ''),
  CONSTRAINT audit_records_request_id_not_blank CHECK (btrim(request_id) <> '')
);

CREATE INDEX IF NOT EXISTS audit_records_workspace_id_idx ON public.audit_records (workspace_id);
CREATE INDEX IF NOT EXISTS audit_records_entity_idx
  ON public.audit_records (entity_type, entity_id);

ALTER TABLE public.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_records FORCE ROW LEVEL SECURITY;

-- One policy covers both the SELECT the app role is granted and the INSERT
-- WITH CHECK; there is no UPDATE/DELETE grant for the policy's USING/WITH
-- CHECK to matter for, but FORCE ROW LEVEL SECURITY + this policy still
-- apply to the table owner too, so this is defense in depth on both axes.
CREATE POLICY audit_records_workspace_isolation ON public.audit_records
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT ON public.audit_records TO slotnova_app;
    REVOKE UPDATE, DELETE ON public.audit_records FROM slotnova_app;
  END IF;
END
$$;
