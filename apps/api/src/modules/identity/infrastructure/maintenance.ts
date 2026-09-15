import type { Pool } from "@slotnova/db";

export async function pruneExpiredSessions(
  pool: Pool,
  batchSize: number,
  retentionDays: number,
): Promise<void> {
  // Do not sever a rotation audit chain. Referenced ancestors remain until
  // their descendants are eligible and have been removed by later sweeps.
  await pool.query(
    `WITH expired AS (
    SELECT s.id FROM public.sessions s
    WHERE s.expires_at < clock_timestamp() - $2 * interval '1 day'
      AND (s.revoked_at IS NULL OR s.revoked_at < clock_timestamp() - $2 * interval '1 day')
      AND NOT EXISTS (SELECT 1 FROM public.sessions child WHERE child.rotated_from = s.id)
    ORDER BY s.expires_at, s.id LIMIT $1 FOR UPDATE OF s SKIP LOCKED
  ) DELETE FROM public.sessions s USING expired WHERE s.id = expired.id`,
    [batchSize, retentionDays],
  );
}

export async function expireWorkspaceInvitations(
  pool: Pool,
  workspaceId: string,
  batchSize: number,
): Promise<void> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL ROLE slotnova_app");
    await tx.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    await tx.query(
      `WITH expired AS (
      SELECT id FROM public.invitations
      WHERE workspace_id = $1 AND status = 'pending' AND expires_at <= clock_timestamp()
      ORDER BY expires_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
    ) UPDATE public.invitations i SET status = 'expired', updated_at = clock_timestamp()
      FROM expired WHERE i.id = expired.id AND i.workspace_id = $1 AND i.status = 'pending'`,
      [workspaceId, batchSize],
    );
    await tx.query("COMMIT");
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
