import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "@slotnova/db";

export interface OutboxRecord {
  id: string;
  workspace_id: string | null;
  event_name: string;
  event_version: number;
  payload: Record<string, unknown>;
  attempts: number;
}

/** A dedicated PostgreSQL session owns the worker lock until all handlers stop.
 * No lease expires underneath a live handler. SIGKILL releases the lock when PG
 * detects the disconnected session. Session-capable connections are required.
 */
export async function openClaimSession(pool: Pool, instanceId: string) {
  const client = await pool.connect();
  const owner = `${instanceId}:${randomUUID()}`;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 168))", [owner]);
  } catch (error) {
    client.release(true);
    throw error;
  }
  return { client, owner };
}

export async function claim(
  client: PoolClient,
  owner: string,
  batchSize: number,
  maxAttempts: number,
  afterId: string | null,
): Promise<{ records: OutboxRecord[]; cursor: string | null }> {
  await client.query("BEGIN");
  try {
    // Lock only a bounded candidate set. Recovery checks the former owner's
    // session lock inside this transaction; live owners cannot be reclaimed.
    const candidates = await client.query<OutboxRecord & { claimed_by: string | null }>(
      `
      SELECT id, workspace_id, event_name, event_version, payload, attempts, claimed_by
      FROM public.outbox_records
      WHERE processed_at IS NULL AND dead_lettered_at IS NULL AND available_at <= clock_timestamp()
      AND ($2::uuid IS NULL OR id > $2)
      ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batchSize, afterId],
    );
    const records: OutboxRecord[] = [];
    for (const row of candidates.rows) {
      if (row.claimed_by && row.claimed_by !== owner) {
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 168)) AS acquired",
          [row.claimed_by],
        );
        if (!lock.rows[0]?.acquired) continue;
      }
      if (row.attempts >= maxAttempts) {
        await client.query(
          `UPDATE public.outbox_records SET dead_lettered_at = clock_timestamp(),
          claimed_at = NULL, claimed_by = NULL WHERE id = $1`,
          [row.id],
        );
        continue;
      }
      const result = await client.query<OutboxRecord>(
        `UPDATE public.outbox_records
        SET claimed_at = clock_timestamp(), claimed_by = $2, attempts = attempts + 1
        WHERE id = $1 RETURNING id, workspace_id, event_name, event_version, payload, attempts`,
        [row.id, owner],
      );
      records.push(result.rows[0]!);
    }
    await client.query("COMMIT");
    // Keyset traversal avoids repeatedly visiting a live owner's oldest rows.
    // Unlike advisory-lock functions in WHERE, this acquires at most batchSize
    // transaction locks even when PostgreSQL scans/sorts a large backlog.
    return { records, cursor: candidates.rows.at(-1)?.id ?? null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
