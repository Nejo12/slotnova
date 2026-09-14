import { Pool } from "@slotnova/db";
import { createLogger } from "@slotnova/observability-server";
import { startConsumer } from "../consumer.js";
const pool = new Pool({ connectionString: process.env["TEST_DATABASE_URL"] });
const consumer = await startConsumer({
  pool,
  logger: createLogger(),
  instanceId: String(process.pid),
  batchSize: 5,
  maxAttempts: 3,
  pollIntervalMs: 20,
  handler: async (record, client) => {
    // Atomic unique-key effect. This table exists ONLY in disposable tests.
    await client.query("INSERT INTO test_effects(id) VALUES ($1) ON CONFLICT DO NOTHING", [
      record.id,
    ]);
    process.send?.({ type: "effect", id: record.id });
    if (process.env["TEST_BARRIER"] === "true") {
      await new Promise<void>((resolve) => process.once("message", () => resolve()));
    }
  },
});
process.send?.({ type: "ready" });
const stop = () => {
  void consumer
    .stop()
    .then(() => pool.end())
    .then(() => process.disconnect());
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
