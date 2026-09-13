-- identity module: users, workspaces, locations, memberships, invitations,
-- sessions (data-model.md, ADR-004, ADR-008, ADR-010). Ownership: this
-- migration belongs to apps/api/src/modules/identity (packages/db defines no
-- domain schema itself, ADR-004).
--
-- Tenant-ownership matrix (data-model.md):
--   users, workspaces, sessions  -> NOT tenant-owned, no RLS
--   locations, memberships, invitations -> tenant-owned: RLS ENABLE + FORCE
--     + a workspace-predicate policy (ADR-008). The predicate uses
--     NULLIF(current_setting('app.workspace_id', true), '')::uuid so a
--     transaction with no context set compares against NULL, which matches
--     no row -- fail closed by construction, not by convention.
--
-- Grants follow least privilege: only INSERT/SELECT/UPDATE are granted to the
-- app role for every table here (no DELETE anywhere in this migration --
-- Phase 1 has no hard-delete path for any identity entity; state transitions
-- are all column updates per data-model.md's state-transition diagrams).

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- users (not tenant-owned)
-- ---------------------------------------------------------------------------

CREATE TYPE user_status AS ENUM ('active', 'disabled');

CREATE TABLE IF NOT EXISTS public.users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref  text        NULL,
  email         citext      NOT NULL,
  display_name  text        NOT NULL,
  status        user_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (btrim(email::text) <> ''),
  CONSTRAINT users_display_name_not_blank CHECK (btrim(display_name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users (email);
-- "unique when present" (data-model.md): a partial index so multiple NULLs
-- are allowed but any two non-null external_ref values must differ.
CREATE UNIQUE INDEX IF NOT EXISTS users_external_ref_key
  ON public.users (external_ref)
  WHERE external_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- workspaces (not tenant-owned -- is the tenant root)
-- ---------------------------------------------------------------------------

CREATE TYPE workspace_status AS ENUM ('active', 'suspended');

CREATE TABLE IF NOT EXISTS public.workspaces (
  id          uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text              NOT NULL,
  slug        text              NOT NULL,
  status      workspace_status  NOT NULL DEFAULT 'active',
  created_at  timestamptz       NOT NULL DEFAULT now(),
  updated_at  timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT workspaces_slug_not_blank CHECK (btrim(slug) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_key ON public.workspaces (slug);

-- ---------------------------------------------------------------------------
-- locations (tenant-owned)
-- ---------------------------------------------------------------------------

CREATE TYPE location_status AS ENUM ('active', 'archived');

CREATE TABLE IF NOT EXISTS public.locations (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid              NOT NULL REFERENCES public.workspaces (id),
  name          text              NOT NULL,
  -- IANA zone id, e.g. "Europe/Berlin". Data only in Phase 1 (ADR-010):
  -- validated at the application boundary (identity/domain/timezone.ts), not
  -- by a database CHECK -- Postgres has no built-in IANA-zone catalogue.
  timezone      text              NOT NULL,
  status        location_status   NOT NULL DEFAULT 'active',
  created_at    timestamptz       NOT NULL DEFAULT now(),
  updated_at    timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT locations_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT locations_timezone_not_blank CHECK (btrim(timezone) <> '')
);

CREATE INDEX IF NOT EXISTS locations_workspace_id_idx ON public.locations (workspace_id);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;

CREATE POLICY locations_workspace_isolation ON public.locations
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- memberships (tenant-owned)
-- ---------------------------------------------------------------------------

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'manager', 'staff');
CREATE TYPE membership_status AS ENUM ('active', 'suspended');

CREATE TABLE IF NOT EXISTS public.memberships (
  id            uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid                NOT NULL REFERENCES public.workspaces (id),
  user_id       uuid                NOT NULL REFERENCES public.users (id),
  role          membership_role     NOT NULL,
  -- Explicit capability list; server-side authorization reads this (FR-031).
  permissions   text[]              NOT NULL DEFAULT ARRAY[]::text[],
  status        membership_status   NOT NULL DEFAULT 'active',
  created_at    timestamptz         NOT NULL DEFAULT now(),
  updated_at    timestamptz         NOT NULL DEFAULT now(),
  -- Referenced key for invitations' composite FK below: PostgreSQL requires
  -- an actual UNIQUE CONSTRAINT (not merely a unique index) on the exact
  -- column list a foreign key references.
  CONSTRAINT memberships_workspace_id_id_key UNIQUE (workspace_id, id)
);

-- A user has at most one membership per workspace (data-model.md).
CREATE UNIQUE INDEX IF NOT EXISTS memberships_workspace_id_user_id_key
  ON public.memberships (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS memberships_workspace_id_idx ON public.memberships (workspace_id);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_workspace_isolation ON public.memberships
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- invitations (tenant-owned)
-- ---------------------------------------------------------------------------

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE IF NOT EXISTS public.invitations (
  id                   uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid                NOT NULL REFERENCES public.workspaces (id),
  email                citext              NOT NULL,
  role                 membership_role     NOT NULL,
  -- Hash of a high-entropy token; the raw token is delivered out-of-band and
  -- never stored (security-and-audit.md).
  token_hash           text                NOT NULL,
  status               invitation_status   NOT NULL DEFAULT 'pending',
  expires_at           timestamptz         NOT NULL,
  -- No simple `REFERENCES memberships (id)` here -- a bare FK only proves the
  -- referenced membership row exists somewhere, not that it belongs to THIS
  -- invitation's workspace. The composite FK below closes that gap at the
  -- database level (independent review finding, PR-07 correction): it makes
  -- a cross-workspace invited_by a referential-integrity violation, not
  -- merely an application bug, even if the caller supplies a real
  -- membership UUID from another workspace.
  invited_by           uuid                NOT NULL,
  accepted_by_user_id  uuid                NULL REFERENCES public.users (id),
  created_at           timestamptz         NOT NULL DEFAULT now(),
  updated_at           timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_not_blank CHECK (btrim(email::text) <> ''),
  CONSTRAINT invitations_token_hash_not_blank CHECK (btrim(token_hash) <> ''),
  CONSTRAINT invitations_invited_by_workspace_fkey
    FOREIGN KEY (workspace_id, invited_by) REFERENCES public.memberships (workspace_id, id)
);

-- Single-use: only one *pending* invitation per (workspace_id, email) may
-- exist at a time (data-model.md); an accepted/revoked/expired row does not
-- block a fresh invite.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_workspace_id_email_key
  ON public.invitations (workspace_id, email)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_workspace_id_idx ON public.invitations (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_key ON public.invitations (token_hash);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_workspace_isolation ON public.invitations
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- sessions (NOT tenant-owned -- keyed by user; no RLS)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sessions (
  -- Hash of the opaque session token carried by the cookie -- the raw token
  -- is never stored (security-and-audit.md).
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid          NOT NULL REFERENCES public.users (id),
  active_workspace_id   uuid          NULL REFERENCES public.workspaces (id),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  last_seen_at          timestamptz   NOT NULL DEFAULT now(),
  expires_at            timestamptz   NOT NULL,
  revoked_at            timestamptz   NULL,
  -- Audit chain across rotations (self-reference).
  rotated_from          uuid          NULL REFERENCES public.sessions (id),
  -- Coarse UA/IP hint for anomaly detection; not PII-heavy.
  client_hint           jsonb         NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);
-- Supports the future session-lookup path: an unrevoked, unexpired session by id.
CREATE INDEX IF NOT EXISTS sessions_active_idx
  ON public.sessions (id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Grants -- least privilege, explicit (no reliance on application behavior
-- alone). Guarded so this migration does not hard-fail in a database where
-- the app role has not been provisioned yet (matches 0001_platform_outbox.sql).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.users TO slotnova_app;
    GRANT SELECT, INSERT, UPDATE ON public.workspaces TO slotnova_app;
    GRANT SELECT, INSERT, UPDATE ON public.locations TO slotnova_app;
    GRANT SELECT, INSERT, UPDATE ON public.memberships TO slotnova_app;
    GRANT SELECT, INSERT, UPDATE ON public.invitations TO slotnova_app;
    GRANT SELECT, INSERT, UPDATE ON public.sessions TO slotnova_app;
  END IF;
END
$$;
