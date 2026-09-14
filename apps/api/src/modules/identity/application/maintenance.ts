import type { Pool } from "@slotnova/db";
import { pruneExpiredSessions, expireWorkspaceInvitations } from "../infrastructure/maintenance.js";

/** Explicit worker application boundary; all Identity table access stays here. */
export function createIdentityMaintenance(pool: Pool) {
  return {
    expiredSessions: (batchSize: number, retentionDays: number) =>
      pruneExpiredSessions(pool, batchSize, retentionDays),
    expiredInvitations: async (batchSize: number) => {
      // Workspaces are top-level, non-RLS aggregates. Keyset paging bounds the
      // discovery query; each tenant mutation uses the ordinary RLS role.
      let cursor = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const { rows } = await pool.query<{ id: string }>(
          "SELECT id FROM public.workspaces WHERE id > $1 ORDER BY id LIMIT $2",
          [cursor, batchSize],
        );
        if (!rows.length) return;
        for (const row of rows) await expireWorkspaceInvitations(pool, row.id, batchSize);
        cursor = rows[rows.length - 1]!.id;
      }
    },
  };
}
