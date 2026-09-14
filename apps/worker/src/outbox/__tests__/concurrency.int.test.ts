import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool, runMigrations } from "@slotnova/db";
import { startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { createLogger } from "@slotnova/observability-server";
import { startConsumer } from "../consumer.js";
let pg: PostgresHarness;
let pool: Pool;
beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations({ connectionString: pg.adminUri });
  pool = new Pool({ connectionString: pg.adminUri });
});
afterAll(async () => {
  await pool?.end();
  await pg?.stop();
});
it("simultaneous independent claims have exclusive ownership and one effective result", async () => {
  await pool.query("CREATE TABLE race_effects(id uuid PRIMARY KEY)");
  await pool.query(`INSERT INTO outbox_records(event_name,payload)
    SELECT 'membership.created','{"requestId":"race"}'::jsonb FROM generate_series(1,10)`);
  const peer = new Pool({ connectionString: pg.adminUri });
  const owners = new Set<string>();
  const executions: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const options = {
    logger: createLogger({ sink: () => {} }),
    batchSize: 5,
    maxAttempts: 3,
    pollIntervalMs: 10,
  };
  const consumers = await Promise.all(
    [pool, peer].map((connectionPool, index) =>
      startConsumer({
        ...options,
        pool: connectionPool,
        instanceId: `race-${index}`,
        handler: async (record, client) => {
          owners.add(String(index));
          executions.push(record.id);
          await barrier;
          // No ON CONFLICT here: duplicate delivery would fail the assertion below.
          await client.query("INSERT INTO race_effects(id) VALUES($1)", [record.id]);
        },
      }),
    ),
  );
  try {
    await expect.poll(() => owners.size, { timeout: 10000 }).toBe(2);
    expect(new Set(executions).size).toBe(executions.length);
    release();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int n FROM outbox_records WHERE processed_at IS NOT NULL",
            )
          ).rows[0].n,
        { timeout: 10000 },
      )
      .toBe(10);
    expect(executions).toHaveLength(10);
    expect(new Set(executions).size).toBe(10);
    expect((await pool.query("SELECT max(attempts) n FROM outbox_records")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM race_effects")).rows[0].n).toBe(10);
  } finally {
    release();
    await Promise.all(consumers.map((consumer) => consumer.stop()));
    await peer.end();
  }
});
