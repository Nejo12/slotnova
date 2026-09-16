-- catalog module: services, service_categories (Phase 2 PR-01, issue #58,
-- data-model.md, ADR-008, ADR-012, ADR-015). Ownership: this migration
-- belongs to apps/api/src/modules/catalog (packages/db defines no domain
-- schema itself, ADR-004).
--
-- Tenant-ownership matrix (specs/002-catalog-scheduling-booking/data-model.md):
--   services, service_categories -> tenant-owned: RLS ENABLE + FORCE
--     + a workspace-predicate policy (ADR-008), same NULLIF(...)::uuid
--     fail-closed pattern as 0002_identity.sql.
--
-- Founder-approved Phase-2 planning scope guard (specs/002-catalog-
-- scheduling-booking/spec.md, research.md): NO service_add_ons table, NO
-- staff_service_capabilities table, NO resource_id/location_id column of
-- any kind. Both are deliberately absent from this migration.
--
-- Grants follow least privilege: only INSERT/SELECT/UPDATE are granted to
-- the app role (no DELETE -- Service deactivation is a column update, never
-- a hard delete, per issue #58 "Service deletion is NOT part of this PR").

-- ---------------------------------------------------------------------------
-- service_categories (tenant-owned)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces (id),
  name          text        NOT NULL,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_categories_name_not_blank CHECK (btrim(name) <> ''),
  -- Referenced key for services' composite FK below: PostgreSQL requires an
  -- actual UNIQUE CONSTRAINT (not merely a unique index) on the exact column
  -- list a foreign key references (same shape as
  -- memberships_workspace_id_id_key in 0002_identity.sql).
  CONSTRAINT service_categories_workspace_id_id_key UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS service_categories_workspace_id_idx
  ON public.service_categories (workspace_id);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY service_categories_workspace_isolation ON public.service_categories
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- services (tenant-owned)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.services (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid        NOT NULL REFERENCES public.workspaces (id),
  category_id           uuid        NULL,
  name                  text        NOT NULL,
  duration_minutes      integer     NOT NULL,
  pre_buffer_minutes    integer     NOT NULL DEFAULT 0,
  post_buffer_minutes   integer     NOT NULL DEFAULT 0,
  -- ADR-015: integer minor units + ISO-4217 currency, never floating point.
  -- Currency-code validity/allowlist is enforced at the application boundary
  -- (catalog/domain/money.ts) -- Postgres has no built-in ISO-4217 catalogue,
  -- matching the identity module's timezone precedent (0002_identity.sql).
  price_amount_minor    bigint      NOT NULL,
  price_currency        text        NOT NULL,
  active                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT services_duration_minutes_positive CHECK (duration_minutes >= 1),
  CONSTRAINT services_pre_buffer_minutes_non_negative CHECK (pre_buffer_minutes >= 0),
  CONSTRAINT services_post_buffer_minutes_non_negative CHECK (post_buffer_minutes >= 0),
  CONSTRAINT services_price_amount_minor_non_negative CHECK (price_amount_minor >= 0),
  CONSTRAINT services_price_currency_not_blank CHECK (btrim(price_currency) <> ''),
  -- Cross-tenant safety net (independent-review-style precedent: a bare
  -- `REFERENCES service_categories (id)` only proves the category exists
  -- *somewhere*, not that it belongs to THIS service's workspace). This
  -- composite FK makes a cross-workspace category association a referential-
  -- integrity violation at the database level, not merely an application
  -- bug, mirroring invitations_invited_by_workspace_fkey in
  -- 0002_identity.sql.
  CONSTRAINT services_category_workspace_fkey
    FOREIGN KEY (workspace_id, category_id)
    REFERENCES public.service_categories (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS services_workspace_id_idx ON public.services (workspace_id);
CREATE INDEX IF NOT EXISTS services_workspace_id_active_idx ON public.services (workspace_id, active);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services FORCE ROW LEVEL SECURITY;

CREATE POLICY services_workspace_isolation ON public.services
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants -- least privilege, explicit. Guarded so this migration does not
-- hard-fail in a database where the app role has not been provisioned yet
-- (matches 0001_platform_outbox.sql / 0002_identity.sql).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.service_categories TO slotnova_app;
    GRANT SELECT, INSERT, UPDATE ON public.services TO slotnova_app;
  END IF;
END
$$;
