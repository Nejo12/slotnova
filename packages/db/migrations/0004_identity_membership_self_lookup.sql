-- identity module (PR-08, T034): adds a second, additive, SELECT-only RLS
-- policy on public.memberships so a signed-in user's OWN active memberships
-- can be discovered across every workspace they belong to.
--
-- Why this is needed: `memberships` is tenant-owned and its existing policy
-- (0002_identity.sql, "memberships_workspace_isolation") requires
-- `app.workspace_id` to be set to the ONE workspace being queried -- by
-- construction that policy can never return rows from more than one
-- workspace in a single query. Sign-in (`POST /v1/auth/session`) and
-- `GET /v1/me` both need exactly that cross-workspace list (data-model.md
-- Session: "workspaces": [...]) before any single workspace has been
-- selected, or independent of whichever workspace is currently active.
--
-- This is the FR-030 "narrowly reviewed platform/admin tooling" exception,
-- not a bypass: RLS stays ENABLE+FORCE, the app role stays non-BYPASSRLS, and
-- the new policy only ever compares against `app.user_id` -- a value the
-- server sets from an ALREADY-authenticated identity (never client input),
-- inside the same transaction as the read (data-model.md "Tenant context
-- contract"). PostgreSQL combines multiple PERMISSIVE policies for the same
-- command with OR, so this widens what SELECT can see (to "my own rows,
-- anywhere") without touching the INSERT/UPDATE policy those commands still
-- go through the original workspace-scoped policy which is unaffected
-- (it applies to ALL commands; this one is SELECT-only and additive).
--
-- The only caller is `identity/infrastructure/repositories/memberships.repository.ts`
-- (`listActiveMembershipsForUser`), and it never sets `app.workspace_id` in
-- that same transaction, so the two policies are never both "active for a
-- write" at once.

CREATE POLICY memberships_self_lookup ON public.memberships
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
