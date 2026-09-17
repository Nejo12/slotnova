-- scheduling module: availability_patterns, availability_exceptions (Phase 2
-- PR-04, issue #66, data-model.md, ADR-008, ADR-010, ADR-012). Ownership:
-- this migration belongs to apps/api/src/modules/scheduling (packages/db
-- defines no domain schema itself, ADR-004).
--
-- Tenant-ownership matrix (specs/002-catalog-scheduling-booking/data-model.md):
--   availability_patterns   -> tenant-owned: RLS ENABLE + FORCE + a workspace
--                              predicate policy, indexes (workspace_id)
--   availability_exceptions -> tenant-owned: same, indexes
--                              (workspace_id, starts_at)
-- Both use the same NULLIF(...)::uuid fail-closed predicate as
-- 0002_identity.sql / 0006_catalog.sql / 0007_platform_idempotency.sql.
--
-- Founder-approved Phase-2 scope guard (spec.md Clarifications 3 & 4,
-- research.md R-SCOPE/R-LOCATION): NO resource_id, NO location_id, NO
-- staff_id column of any kind. `workspace_id` is the single implicit
-- Phase-2 scheduling resource. No Booking table, no Calendar table, and
-- deliberately NO btree_gist/EXCLUDE constraint -- that extension arrives
-- with Booking overlap prevention in PR-06 (tasks.md), not here.
--
-- Grants follow least privilege: SELECT + INSERT only. The approved
-- Scheduling contract (contracts/scheduling.contract.md) exposes exactly
-- four endpoints -- list patterns, create pattern, create exception,
-- resolve -- and none of them updates or deletes a row, so no UPDATE/DELETE
-- privilege is granted for a code path that does not exist.

-- ---------------------------------------------------------------------------
-- availability_patterns (tenant-owned)
--
-- `weekly_rule` is a validated structured document, never freeform data: the
-- authoritative validation is the merged PR-03 domain
-- (apps/api/src/modules/scheduling/domain/recurrence.ts --
-- `createWeeklyAvailabilityPattern`), which rejects a non-ISO day, a
-- local-time range outside [0,1440), a range that does not satisfy
-- start < end, and two rules overlapping within the same day. PostgreSQL
-- cannot express those rules without smuggling a second copy of the
-- recurrence model into SQL, so the CHECK below asserts only the
-- structural envelope (a JSON array of objects) -- a shape guard, not a
-- competing validator.
--
-- `effective_from`/`effective_until` are DATE semantics and the window is
-- HALF-OPEN `[effective_from, effective_until)` (Founder decision carried
-- forward from PR-03: `effective_until = 2026-10-01` produces no
-- availability on 2026-10-01). The CHECK below enforces the strict
-- `from < until` ordering whenever both bounds are present; a NULL bound
-- means unbounded on that side.
--
-- PATTERN-HISTORY INVARIANT (PROPOSED IN THIS PR -- see the PR body): the
-- approved model says a workspace has exactly ONE availability pattern set
-- (spec.md Key Entities "one pattern set per workspace";
-- contracts/scheduling.contract.md "in practice at most the workspace's
-- single active pattern set, but returned as a list to allow
-- effective-dated pattern history"; tasks.md PR-04 "`resolve` ... over the
-- workspace's single pattern"). Two patterns whose effective windows
-- overlap would make `resolve` ambiguous, and NO accepted artifact defines
-- a precedence rule between them. Rather than inventing one
-- (newest-wins/highest-id-wins/arbitrary SQL ordering), simultaneous
-- overlap is FORBIDDEN, so at most one pattern is ever effective on a given
-- date and precedence never arises.
--
-- That invariant is enforced in
-- apps/api/src/modules/scheduling/application/create-availability-pattern.use-case.ts
-- under a per-workspace transaction advisory lock, NOT by a database
-- constraint, for one concrete reason: the only constraint that expresses
-- "no two daterange values overlap for the same workspace_id" is
-- `EXCLUDE USING gist (workspace_id WITH =, daterange(...) WITH &&)`, which
-- requires the `btree_gist` extension. tasks.md assigns `CREATE EXTENSION
-- btree_gist` to PR-06 (Booking overlap), and pulling a shared extension
-- forward into an unrelated slice is exactly the speculative scope creep
-- constitution VI prohibits. The advisory lock serialises pattern creation
-- per workspace, so the check-then-insert cannot race. If the Founder
-- ratifies this invariant, promoting it to a real exclusion constraint is a
-- one-line additive migration once PR-06 has installed btree_gist.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.availability_patterns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces (id),
  -- IANA identifier (e.g. 'Europe/London'). Validity is asserted at the
  -- application boundary by the PR-03 domain's `assertValidIanaTimeZone`,
  -- matching the identity module's timezone precedent (0002_identity.sql) --
  -- PostgreSQL has no portable IANA-identifier validator.
  timezone        text        NOT NULL,
  weekly_rule     jsonb       NOT NULL,
  effective_from  date        NULL,
  effective_until date        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_patterns_timezone_not_blank CHECK (btrim(timezone) <> ''),
  -- Array-only. A per-element "is an object" test would need a subquery,
  -- which PostgreSQL forbids in a CHECK constraint; an immutable helper
  -- function written purely to smuggle one in would be a second, partial copy
  -- of the recurrence model living in SQL. The element shape is asserted
  -- where it belongs: `createWeeklyAvailabilityPattern`, on write AND again
  -- on every read (resolve-availability.use-case.ts rehydrates through it),
  -- so a hand-edited row fails loudly rather than producing wrong output.
  CONSTRAINT availability_patterns_weekly_rule_is_array CHECK (
    jsonb_typeof(weekly_rule) = 'array'
  ),
  CONSTRAINT availability_patterns_effective_window_ordered CHECK (
    effective_from IS NULL OR effective_until IS NULL OR effective_from < effective_until
  )
);

CREATE INDEX IF NOT EXISTS availability_patterns_workspace_id_idx
  ON public.availability_patterns (workspace_id);

ALTER TABLE public.availability_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_patterns FORCE ROW LEVEL SECURITY;

CREATE POLICY availability_patterns_workspace_isolation ON public.availability_patterns
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- availability_exceptions (tenant-owned)
--
-- Always RESOLVED instants, never a recurring rule (FR-012,
-- contracts/scheduling.contract.md) -- there is deliberately no rule/RRULE
-- column here. The interval is half-open `[starts_at, ends_at)` with
-- `starts_at < ends_at`, the same semantics `scheduling/domain/interval.ts`
-- enforces in the domain.
--
-- Precedence is fixed and needs no column: an exception ALWAYS subtracts
-- from the recurring pattern's output for its overlapping span
-- (data-model.md "AvailabilityException"; FR-012). There is no
-- additive/override exception kind in Phase 2.
--
-- `updated_at` is deliberately absent: the approved contract has no
-- exception-update endpoint, so a column that could only ever equal
-- `created_at` would be speculative (constitution VI).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.availability_exceptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces (id),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  reason       text        NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_exceptions_half_open_range CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS availability_exceptions_workspace_id_starts_at_idx
  ON public.availability_exceptions (workspace_id, starts_at);

ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_exceptions FORCE ROW LEVEL SECURITY;

CREATE POLICY availability_exceptions_workspace_isolation ON public.availability_exceptions
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Grants -- least privilege, explicit. Guarded so this migration does not
-- hard-fail in a database where the app role has not been provisioned yet
-- (matches 0001_platform_outbox.sql / 0002_identity.sql / 0006_catalog.sql).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotnova_app') THEN
    GRANT SELECT, INSERT ON public.availability_patterns TO slotnova_app;
    GRANT SELECT, INSERT ON public.availability_exceptions TO slotnova_app;
  END IF;
END
$$;
