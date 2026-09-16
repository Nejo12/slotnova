import { Pool } from "@slotnova/db";
import { createLogger } from "@slotnova/observability-server";
import { startConsumer } from "../consumer.js";
import { handleIdentityEvent } from "../handlers/identity.js";

/**
 * Test-only, executable-boundary fixture (T078 repair): runs the REAL worker
 * outbox consumer/dispatch path (`startConsumer` → `claim` → `dispatch` →
 * `handleIdentityEvent`) as its own OS process against a real Postgres
 * database, and prints every structured log line to stdout.
 *
 * This exists so `apps/api`'s correlation-propagation integration test can
 * prove "a real API-generated outbox row is processed by the real worker
 * path" without `apps/api` taking a static/production dependency on
 * `@slotnova/worker` (forbidden — see `tooling/dependency-cruiser`). The
 * caller `fork()`s this file by filesystem path; a subprocess boundary is not
 * a module import edge, so no cross-app dependency-graph edge is created.
 * This mirrors the pattern `apps/worker/src/outbox/__tests__/consumer.int
 * .test.ts` already uses for its own crash/ownership fixtures
 * (`__fixtures__/process.ts`), just handed a real handler instead of a
 * test-only effect table.
 *
 * Reads `TEST_DATABASE_URL` (a connection string to the already-migrated
 * database the caller started) and exits once the consumer has processed at
 * least one record, or after a bounded timeout with a non-zero exit code.
 */
const pool = new Pool({ connectionString: process.env["TEST_DATABASE_URL"] });
const lines: string[] = [];

const consumer = await startConsumer({
  pool,
  logger: createLogger({
    sink: (line) => {
      lines.push(line);
      process.stdout.write(`${line}\n`);
    },
  }),
  instanceId: `consume-one-${process.pid}`,
  batchSize: 5,
  maxAttempts: 3,
  pollIntervalMs: 20,
  handler: handleIdentityEvent,
});

const timeoutMs = Number(process.env["TEST_TIMEOUT_MS"] ?? 15_000);
const deadline = Date.now() + timeoutMs;
const sawDispatch = () => lines.some((line) => JSON.parse(line).event === "outbox.handled");

while (!sawDispatch() && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

await consumer.stop();
await pool.end();
process.exit(sawDispatch() ? 0 : 1);
