-- PR-10 / T045-T047: token-capability lookup for invitation preview and
-- acceptance. Invitations remain FORCE-RLS tenant rows. Before the caller can
-- know which workspace to SET LOCAL, it may SELECT exactly the row whose
-- server-computed token hash matches this transaction-local setting. This
-- policy is SELECT-only; every INSERT/UPDATE still requires app.workspace_id.

CREATE POLICY invitations_token_lookup ON public.invitations
  FOR SELECT
  USING (
    token_hash = NULLIF(current_setting('app.invitation_token_hash', true), '')
  );
