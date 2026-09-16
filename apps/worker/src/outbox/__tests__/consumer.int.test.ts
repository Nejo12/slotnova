import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, runMigrations } from "@slotnova/db";
import { startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { createLogger } from "@slotnova/observability-server";
import { startConsumer } from "../consumer.js";

let pg: PostgresHarness;
let pool: Pool;
const children: ChildProcess[] = [];
const messages = new Map<ChildProcess, { type: string; id?: string }[]>();
function child(barrier: boolean) {
  const worker = fork(fileURLToPath(new URL("../__fixtures__/process.ts", import.meta.url)), [], {
    execArgv: ["--import", "tsx"],
    env: { ...process.env, TEST_DATABASE_URL: pg.adminUri, TEST_BARRIER: String(barrier) },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  children.push(worker);
  messages.set(worker, []);
  worker.on("message", (message) =>
    messages.get(worker)!.push(message as { type: string; id?: string }),
  );
  return worker;
}
async function terminate(worker: ChildProcess, signal: NodeJS.Signals) {
  const exited = once(worker, "exit", { signal: AbortSignal.timeout(15000) });
  worker.kill(signal);
  await exited;
}
async function insert(count = 1) {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO public.outbox_records(event_name, payload)
    SELECT 'membership.created', '{"requestId":"correlated-request","membershipId":"member","role":"staff"}'::jsonb
    FROM generate_series(1, $1) RETURNING id`,
      [count],
    )
  ).rows;
}
beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations({ connectionString: pg.adminUri });
  pool = new Pool({ connectionString: pg.adminUri });
  await pool.query("CREATE TABLE test_effects(id uuid PRIMARY KEY)");
});
afterAll(async () => {
  for (const worker of children)
    if (worker.exitCode === null && worker.signalCode === null) await terminate(worker, "SIGKILL");
  await pool?.end();
  await pg?.stop();
});
beforeEach(async () => {
  await pool.query("TRUNCATE public.outbox_records, test_effects");
});

describe("outbox durability", () => {
  it("SIGKILL after committed effect recovers the whole batch without duplicate outcome", async () => {
    const rows = await insert(5);
    const first = child(true);
    await expect
      .poll(() => messages.get(first)!.some((m) => m.type === "effect"), { timeout: 15000 })
      .toBe(true);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM outbox_records WHERE claimed_by IS NOT NULL AND processed_at IS NULL",
        )
      ).rowCount,
    ).toBe(5);
    await terminate(first, "SIGKILL");
    const second = child(false);
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int n FROM outbox_records WHERE processed_at IS NOT NULL",
            )
          ).rows[0].n,
        { timeout: 15000 },
      )
      .toBe(5);
    expect((await pool.query("SELECT id FROM test_effects ORDER BY id")).rows).toEqual(
      [...rows].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect((await pool.query("SELECT max(attempts) n FROM outbox_records")).rows[0].n).toBe(2);
    await terminate(second, "SIGTERM");
  });
  it("bounds poison attempts, retains dead-letter rows, and propagates correlation", async () => {
    await insert();
    const lines: string[] = [];
    const consumer = await startConsumer({
      pool,
      instanceId: "poison",
      batchSize: 2,
      maxAttempts: 3,
      pollIntervalMs: 10,
      logger: createLogger({ sink: (line) => lines.push(line) }),
      handler: async () => {
        throw new Error("poison");
      },
    });
    try {
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                "SELECT attempts FROM outbox_records WHERE dead_lettered_at IS NOT NULL",
              )
            ).rows[0]?.attempts,
          { timeout: 10000 },
        )
        .toBe(3);
      expect(
        lines
          .map((line) => JSON.parse(line))
          .filter((line) => line.event === "outbox.dispatch")
          .every(
            (line) =>
              line.correlationId === "correlated-request" &&
              line.requestId === "correlated-request",
          ),
      ).toBe(true);
    } finally {
      await consumer.stop();
    }
    expect(
      (await pool.query("SELECT attempts, processed_at, claimed_by FROM outbox_records")).rows[0],
    ).toEqual({ attempts: 3, processed_at: null, claimed_by: null });
  });
  it("two independent processes cannot take a live owner's rows, even while it is paused", async () => {
    await insert(5);
    const first = child(true);
    await expect
      .poll(() => messages.get(first)!.some((m) => m.type === "effect"), { timeout: 15000 })
      .toBe(true);
    const extra = await insert(1);
    const second = child(false);
    // Observing the second process finish newer work proves it actively polled
    // against the older, live claims rather than simply never running.
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT processed_at IS NOT NULL done FROM outbox_records WHERE id=$1",
              [extra[0]!.id],
            )
          ).rows[0].done,
        { timeout: 15000 },
      )
      .toBe(true);
    expect(messages.get(second)!.filter((m) => m.type === "effect")).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int n FROM test_effects")).rows[0].n).toBe(2);
    await terminate(first, "SIGKILL");
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int n FROM outbox_records WHERE processed_at IS NOT NULL",
            )
          ).rows[0].n,
        { timeout: 15000 },
      )
      .toBe(6);
    expect((await pool.query("SELECT count(*)::int n FROM test_effects")).rows[0].n).toBe(6);
    await terminate(second, "SIGINT");
  });
});

it("does not leak correlation context between sequentially processed jobs", async () => {
  // Two records with distinct requestIds, processed one after another by the
  // SAME consumer instance/process (batchSize 1 forces strict sequencing).
  // Real worker ALS state must be scoped per job: neither job's structured
  // log may ever show the other job's correlationId/requestId (T076 FR-054;
  // repair for the T078 blocker requiring explicit sequential-leak proof).
  const first = (
    await pool.query<{ id: string }>(
      `INSERT INTO public.outbox_records(event_name, payload)
       VALUES ('membership.created', '{"requestId":"job-a-request","membershipId":"member-a","role":"staff"}'::jsonb)
       RETURNING id`,
    )
  ).rows[0]!;
  const second = (
    await pool.query<{ id: string }>(
      `INSERT INTO public.outbox_records(event_name, payload)
       VALUES ('membership.created', '{"requestId":"job-b-request","membershipId":"member-b","role":"staff"}'::jsonb)
       RETURNING id`,
    )
  ).rows[0]!;

  const lines: string[] = [];
  const consumer = await startConsumer({
    pool,
    instanceId: "sequential-no-leak",
    batchSize: 1,
    maxAttempts: 3,
    pollIntervalMs: 10,
    logger: createLogger({ sink: (line) => lines.push(line) }),
    handler: async () => {},
  });
  try {
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int n FROM outbox_records WHERE processed_at IS NOT NULL AND id IN ($1, $2)",
              [first.id, second.id],
            )
          ).rows[0].n,
        { timeout: 15000 },
      )
      .toBe(2);
  } finally {
    await consumer.stop();
  }

  const dispatchLogs = lines
    .map((line) => JSON.parse(line))
    .filter((line) => line.event === "outbox.dispatch");
  expect(dispatchLogs).toHaveLength(2);

  const jobA = dispatchLogs.find((line) => line.meta?.eventId === first.id);
  const jobB = dispatchLogs.find((line) => line.meta?.eventId === second.id);
  expect(jobA?.correlationId).toBe("job-a-request");
  expect(jobA?.requestId).toBe("job-a-request");
  expect(jobB?.correlationId).toBe("job-b-request");
  expect(jobB?.requestId).toBe("job-b-request");
  // Neither job's log line carries the other job's correlation/request id.
  expect(jobA?.correlationId).not.toBe(jobB?.correlationId);
  expect(
    dispatchLogs.every((line) => ["job-a-request", "job-b-request"].includes(line.requestId)),
  ).toBe(true);
});

it("malformed JSON payloads exhaust safely without terminating the consumer", async () => {
  await pool.query(
    "INSERT INTO outbox_records(event_name,payload) VALUES('membership.created','null'::jsonb)",
  );
  const consumer = await startConsumer({
    pool,
    instanceId: "malformed",
    batchSize: 5,
    maxAttempts: 2,
    pollIntervalMs: 10,
    logger: createLogger({ sink: () => {} }),
  });
  try {
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT attempts FROM outbox_records WHERE dead_lettered_at IS NOT NULL",
            )
          ).rows[0]?.attempts,
        { timeout: 10000 },
      )
      .toBe(2);
    await insert();
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
      .toBe(1);
  } finally {
    await consumer.stop();
  }
});
it("an abandoned final claim is dead-lettered without another handler attempt", async () => {
  await insert();
  await pool.query(
    "UPDATE outbox_records SET attempts=3, claimed_by='disconnected-owner', claimed_at=clock_timestamp()",
  );
  let calls = 0;
  const consumer = await startConsumer({
    pool,
    instanceId: "recovery",
    batchSize: 5,
    maxAttempts: 3,
    pollIntervalMs: 10,
    logger: createLogger({ sink: () => {} }),
    handler: async () => {
      calls++;
    },
  });
  try {
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT attempts FROM outbox_records WHERE dead_lettered_at IS NOT NULL",
            )
          ).rows[0]?.attempts,
        { timeout: 10000 },
      )
      .toBe(3);
    expect(calls).toBe(0);
  } finally {
    await consumer.stop();
  }
});

it("loss of the ownership session is fatal rather than silently stopping polling", async () => {
  const ownedPool = new Pool({
    connectionString: pg.adminUri,
    application_name: "ownership-loss-test",
  });
  const consumer = await startConsumer({
    pool: ownedPool,
    instanceId: "lost",
    batchSize: 5,
    maxAttempts: 3,
    pollIntervalMs: 1000,
    logger: createLogger({ sink: () => {} }),
  });
  const result = consumer.done.then(
    () => "unexpected success",
    () => "failed",
  );
  try {
    await pool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='ownership-loss-test'",
    );
    await expect(result).resolves.toBe("failed");
  } finally {
    await consumer.stop().catch(() => {});
    await ownedPool.end();
  }
});
