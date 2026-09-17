-- booking module: bookings (Phase 2 PR-05, issue #68, data-model.md
-- "Booking", ADR-008, ADR-010, ADR-012). Ownership: this migration belongs to
-- apps/api/src/modules/booking (packages/db defines no domain schema itself,
-- ADR-004).
--
-- Tenant-ownership matrix (specs/002-catalog-scheduling-booking/data-model.md):
--   bookings -> tenant-owned: RLS ENABLE + FORCE + a workspace predicate
--               policy, index (workspace_id)
-- Uses the same NULLIF(...)::uuid fail-closed predicate as 0002_identity.sql /
-- 0006_catalog.sql / 0007_platform_idempotency.sql / 0008_scheduling.sql.
--
-- Founder-approved Phase-2 scope guard (spec.md Clarifications / Founder
-- decisions 1-5, data-model.md "Explicit non-entities", research.md
-- R-SCOPE/R-LOCATION/R-CLIENTS): NO resource_id, NO location_id, NO staff_id,
-- NO client_id column of any kind, and no nullable placeholder "for later".
-- `workspace_id` is the single implicit Phase-2 protected resource
-- (research.md R-EXCL). Phase 3 adds the Booking<->Client association via its
-- own additive migration (FR-029).
--
-- `service_id` is an OPAQUE Catalog-owned reference (data-model.md "Booking":
-- "reference only"; "Cross-module references (Booking -> Service) are by
-- opaque id only, never a foreign-key join across module schemas in
-- application code"). There is deliberately NO foreign key to
-- public.services: the accepted data model declares no such constraint, and a
-- physical cross-module FK would couple two module schemas that ADR-012 keeps
-- separately owned. The snapshot columns below are what make that safe -- a
-- Booking never needs to read a Service row to know its own blocking span.
--
-- DELIBERATELY NOT IN THIS MIGRATION (tasks.md PR-06 owns all of it):
-- `CREATE EXTENSION btree_gist`, the `bookings_no_overlap`
-- `EXCLUDE USING gist (workspace_id WITH =, blocking_range WITH &&)
-- WHERE (status = 'confirmed')` constraint from data-model.md, and the GiST
-- index that constraint creates. PR-05 proves the state machine; PR-06 proves
-- concurrency. Splitting them is an explicit tasks.md PR-05 constraint
-- ("no exclusion constraint yet (isolates the state-machine proof from the
-- concurrency proof for clean review)"), and pulling a shared extension
-- forward into an unrelated slice is the speculative scope creep
-- constitution VI prohibits.

-- ---------------------------------------------------------------------------
-- booking_status
--
-- A real PostgreSQL enum, matching 0002_identity.sql's precedent
-- (`user_status`, `membership_role`, ...) rather than a text column plus a
-- CHECK, so the set of legal values is a schema fact a test can read out of
-- `pg_enum` instead of parsing a constraint expression.
--
-- EXACTLY three values. There is no `draft` and no `pending` value: Draft and
-- Review are client/UI-only concepts that are never persisted (FR-020,
-- Founder decision 1), and `pending` is a documented FUTURE lifecycle
-- extension point (Founder decision 2) that must NOT be added to the Phase-2
-- enum for speculative future use. A later phase that introduces a real
-- approval-required creation path adds the value, a `ConfirmBooking` command
-- and a transition-table row together, in its own additive migration.
-- ---------------------------------------------------------------------------

CREATE TYPE booking_status AS ENUM ('confirmed', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- booking_blocking_range()
--
-- The blocking-span formula from data-model.md "Booking" / FR-022:
--   [starts_at - pre_buffer, starts_at + service_duration + post_buffer)
-- half-open, in UTC, exactly like `scheduling/domain/interval.ts` (ADR-010).
--
-- Why a function instead of writing the expression inline in the generated
-- column: PostgreSQL requires a generated column's expression to be
-- IMMUTABLE, and both obvious spellings are rejected --
-- `timestamptz + interval` is only STABLE (a month/day interval's result
-- depends on the session TimeZone) and so is `extract(epoch from
-- timestamptz)`. Adding a SECONDS-ONLY interval to an absolute instant is
-- genuinely timezone-independent, so this wrapper is honestly immutable
-- rather than a volatility lie: `make_interval(secs => ...)` never consults
-- TimeZone, and `booking/__tests__/schema.int.test.ts` asserts the stored
-- range is identical across DST boundaries and session time zones.
--
-- STRICT: every input column is NOT NULL, so the NULL branch is unreachable;
-- declaring it removes the need for the planner to consider one.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_blocking_range(
  starts_at                timestamptz,
  service_duration_minutes integer,
  pre_buffer_minutes       integer,
  post_buffer_minutes      integer
) RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT tstzrange(
    starts_at - make_interval(secs => pre_buffer_minutes * 60),
    starts_at + make_interval(secs => (service_duration_minutes + post_buffer_minutes) * 60),
    '[)'
  )
$$;

-- ---------------------------------------------------------------------------
-- bookings (tenant-owned)
--
-- `service_duration_minutes` / `pre_buffer_minutes` / `post_buffer_minutes`
-- are SNAPSHOTTED from the Service at creation time (data-model.md
-- "Booking"), so a later Service edit never retroactively changes a
-- historical Booking's blocking interval. They are therefore NOT re-read on
-- reschedule -- reschedule moves `starts_at` only.
--
-- `version` is the optimistic-concurrency column (research.md R-OCC,
-- FR-026). It starts at 1 and is incremented by every real mutating
-- transition; the repository's guarded `WHERE id = $1 AND version = $2`
-- UPDATE is the actual lost-update protection, never a read-then-write check.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bookings (
  id                       uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid           NOT NULL REFERENCES public.workspaces (id),
  -- Opaque Catalog-owned reference; deliberately no FK (see header).
  service_id               uuid           NOT NULL,
  starts_at                timestamptz    NOT NULL,
  service_duration_minutes integer        NOT NULL,
  pre_buffer_minutes       integer        NOT NULL,
  post_buffer_minutes      integer        NOT NULL,
  blocking_range           tstzrange      NOT NULL GENERATED ALWAYS AS (
    public.booking_blocking_range(
      starts_at, service_duration_minutes, pre_buffer_minutes, post_buffer_minutes
    )
  ) STORED,
  status                   booking_status NOT NULL,
  version                  integer        NOT NULL DEFAULT 1,
  cancelled_reason         text           NULL,
  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  -- data-model.md "Validation rules": duration >= 1, buffers >= 0.
  CONSTRAINT bookings_service_duration_positive CHECK (service_duration_minutes >= 1),
  CONSTRAINT bookings_pre_buffer_non_negative CHECK (pre_buffer_minutes >= 0),
  CONSTRAINT bookings_post_buffer_non_negative CHECK (post_buffer_minutes >= 0),
  -- Optimistic version never moves backwards past its initial value.
  CONSTRAINT bookings_version_positive CHECK (version >= 1),
  -- data-model.md "Validation rules": "`Booking.blocking_range` lower bound is
  -- always `<` upper bound (non-empty range) -- enforced by a CHECK constraint
  -- in addition to the application computing it correctly". The duration
  -- CHECK above already implies it, but the accepted model asks for the range
  -- itself to be asserted, and PR-06's exclusion predicate is meaningless for
  -- an empty range.
  CONSTRAINT bookings_blocking_range_non_empty CHECK (NOT isempty(blocking_range)),
  -- data-model.md "Booking": `cancelled_reason` is "set only on
  -- cancellation". A reason on a confirmed/completed row would be a lie about
  -- the lifecycle, so the two columns are kept consistent in the database and
  -- not only in the aggregate. A cancelled booking MAY still have a NULL
  -- reason -- the approved contract's `POST /bookings/:id/cancel` takes
  -- `{ version, reason? }`, so the reason is optional.
  CONSTRAINT bookings_cancelled_reason_requires_cancelled CHECK (
    cancelled_reason IS NULL OR status = 'cancelled'
  )
);

-- data-model.md's RLS matrix lists `(workspace_id)` plus a GiST index on
-- `(workspace_id, blocking_range)` "(see exclusion constraint)". Only the
-- first is created here: the GiST index IS the exclusion constraint's index
-- and requires btree_gist, both of which are PR-06's.
CREATE INDEX IF NOT EXISTS bookings_workspace_id_idx
  ON public.bookings (workspace_id);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

CREATE POLICY bookings_workspace_isolation ON public.bookings
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants -- least privilege, explicit. Guarded so this migration does not
-- hard-fail in a database where the app role has not been provisioned yet
-- (matches 0001_platform_outbox.sql / 0002_identity.sql / 0006_catalog.sql /
-- 0008_scheduling.sql).
--
-- SELECT + INSERT + UPDATE. Unlike Scheduling, Booking genuinely updates:
-- reschedule, cancel and complete are all guarded UPDATEs. DELETE is NOT
-- granted -- cancellation is a state transition that keeps the historical
-- row (data-model.md: `completed`/`cancelled` are terminal, non-blocking),
-- and no accepted artifact defines a Booking deletion path.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.bookings TO slotnova_app;
  END IF;
END
$$;
