import type { Pool } from "@slotnova/db";
export const outboxRetention =
  (pool: Pool, batchSize: number, retentionDays: number) => async () => {
    await pool.query(
      `WITH processed AS (
    SELECT id FROM public.outbox_records WHERE processed_at IS NOT NULL
      AND processed_at < clock_timestamp() - $2 * interval '1 day'
      AND dead_lettered_at IS NULL AND claimed_at IS NULL AND claimed_by IS NULL
    ORDER BY processed_at, id LIMIT $1 FOR UPDATE SKIP LOCKED
  ) DELETE FROM public.outbox_records o USING processed WHERE o.id = processed.id`,
      [batchSize, retentionDays],
    );
  };
