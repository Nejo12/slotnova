import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBoss } from "pg-boss";
import { Pool, runMigrations } from "@slotnova/db";
import { startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { createLogger } from "@slotnova/observability-server";
import { createScheduler } from "../runner.js";
import { createWorker } from "../../worker.js";
import { resolveWorkerConfig } from "../../config.js";

let pg: PostgresHarness;
let pool: Pool;
let boss: PgBoss;
const quiet = createLogger({ sink: () => {} });
beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations({ connectionString: pg.adminUri });
  pool = new Pool({ connectionString: pg.adminUri });
  await pool.query("CREATE TABLE scheduled_effects(id uuid PRIMARY KEY)");
  boss = new PgBoss({
    connectionString: pg.adminUri,
    schema: "scheduler_test",
    maintenanceIntervalSeconds: 1,
  });
  boss.on("error", (error) => {
    throw error;
  });
  await boss.start();
});
afterAll(async () => {
  await boss?.stop();
  await pool?.end();
  await pg?.stop();
});
describe("scheduler durability and concurrency", () => {
  it("two independent workers overlap while each job has one execution", async () => {
    await boss.createQueue("race");
    const peer = new PgBoss({
      connectionString: pg.adminUri,
      schema: "scheduler_test",
      migrate: false,
    });
    peer.on("error", (error) => {
      throw error;
    });
    await peer.start();
    const executed: string[] = [];
    const workers = new Set<string>();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = (worker: string) => async (jobs: { id: string }[]) => {
      workers.add(worker);
      executed.push(jobs[0]!.id);
      await barrier;
      await pool.query("INSERT INTO scheduled_effects(id) VALUES($1)", [jobs[0]!.id]);
    };
    try {
      await Promise.all([
        boss.work("race", { pollingIntervalSeconds: 0.5 }, handler("a")),
        peer.work("race", { pollingIntervalSeconds: 0.5 }, handler("b")),
      ]);
      const ids = await Promise.all(Array.from({ length: 8 }, () => boss.send("race")));
      await expect.poll(() => workers.size, { timeout: 15000 }).toBe(2);
      expect(new Set(executed).size).toBe(executed.length);
      release();
      await expect
        .poll(
          async () => (await boss.findJobs("race")).filter((j) => j.state === "completed").length,
          { timeout: 15000 },
        )
        .toBe(8);
      expect(executed.sort()).toEqual(ids.sort());
    } finally {
      release();
      await peer.stop();
      await boss.offWork("race", { wait: true });
    }
  });
  it("a delayed job survives a real process kill and restart", async () => {
    await boss.createQueue("delayed");
    const spawn = () =>
      fork(fileURLToPath(new URL("../__fixtures__/process.ts", import.meta.url)), [], {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, TEST_DATABASE_URL: pg.adminUri },
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      });
    const first = spawn();
    await once(first, "message", { signal: AbortSignal.timeout(15000) });
    const id = await boss.send("delayed", {}, { startAfter: 3 });
    const killed = once(first, "exit", { signal: AbortSignal.timeout(15000) });
    first.kill("SIGKILL");
    await killed;
    expect((await pool.query("SELECT 1 FROM scheduled_effects WHERE id=$1", [id])).rowCount).toBe(
      0,
    );
    const second = spawn();
    try {
      await expect
        .poll(async () => (await boss.findJobs("delayed", { id: id! }))[0]?.state, {
          timeout: 20000,
        })
        .toBe("completed");
      expect((await pool.query("SELECT 1 FROM scheduled_effects WHERE id=$1", [id])).rowCount).toBe(
        1,
      );
      const timing = await pool.query(
        "SELECT started_on >= start_after AS timely FROM scheduler_test.job WHERE id=$1",
        [id],
      );
      expect(timing.rows[0].timely).toBe(true);
    } finally {
      const exited = once(second, "exit", { signal: AbortSignal.timeout(15000) });
      second.kill("SIGTERM");
      await exited;
    }
  });
  it("bounded retries back off and end in inspectable terminal failure", async () => {
    await boss.createQueue("poison", { retryLimit: 2, retryDelay: 1, retryBackoff: true });
    await pool.query("CREATE TABLE failure_attempts(at timestamptz DEFAULT clock_timestamp())");
    await boss.work("poison", { pollingIntervalSeconds: 0.5 }, async () => {
      await pool.query("INSERT INTO failure_attempts DEFAULT VALUES");
      throw new Error("intentional poison");
    });
    const id = await boss.send("poison");
    await expect
      .poll(async () => (await boss.findJobs("poison", { id: id! }))[0]?.state, { timeout: 45000 })
      .toBe("failed");
    const job = (await boss.findJobs("poison", { id: id! }))[0]!;
    expect(job.retryCount).toBe(2);
    expect(job.output).toBeTruthy();
    const gaps = (
      await pool.query(
        "SELECT extract(epoch FROM at - lag(at) OVER (ORDER BY at))::float AS gap FROM failure_attempts ORDER BY at",
      )
    ).rows;
    expect(gaps).toHaveLength(3);
    expect(gaps[1].gap).toBeGreaterThanOrEqual(1);
    expect(gaps[2].gap).toBeGreaterThanOrEqual(2);
  });
  it("recurring registration produces two distinct successful jobs", async () => {
    await boss.createQueue("recurring");
    await boss.work("recurring", { pollingIntervalSeconds: 0.5 }, async () => {});
    await boss.schedule("recurring", "* * * * *", {}, { tz: "UTC" });
    try {
      await expect
        .poll(
          async () =>
            (await boss.findJobs("recurring")).filter((job) => job.state === "completed").length,
          { timeout: 150000, interval: 500 },
        )
        .toBeGreaterThanOrEqual(2);
    } finally {
      await boss.unschedule("recurring");
    }
  });
  it("supported enqueue adapter participates in caller commit and rollback", async () => {
    const runner = createScheduler(pg.adminUri, "transaction_test", true, quiet);
    await runner.start({
      "expired-sessions": async () => {},
      "expired-invitations": async () => {},
      "outbox-retention": async () => {},
    });
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      const rolledBack = await runner.enqueue("expired-sessions", tx);
      await tx.query("ROLLBACK");
      expect(
        (await pool.query("SELECT 1 FROM transaction_test.job WHERE id=$1", [rolledBack])).rowCount,
      ).toBe(0);
      await tx.query("BEGIN");
      const committed = await runner.enqueue("expired-sessions", tx);
      await tx.query("COMMIT");
      expect(
        (await pool.query("SELECT 1 FROM transaction_test.job WHERE id=$1", [committed])).rowCount,
      ).toBe(1);
      expect(await runner.inspectFailures()).toEqual([]);
    } finally {
      tx.release();
      await runner.stop();
    }
  });
  it("real worker startup and idempotent shutdown close resources", async () => {
    const lines: string[] = [];
    const worker = createWorker({
      config: resolveWorkerConfig({
        WORKER_DATABASE_URL: pg.adminUri,
        WORKER_SCHEDULER_SCHEMA: "worker_lifecycle",
        WORKER_SCHEDULER_MIGRATE: "true",
      }),
      sink: (line) => lines.push(line),
    });
    await Promise.all([worker.start(), worker.start()]);
    await Promise.all([worker.stop(), worker.stop()]);
    expect(
      lines.map((line) => JSON.parse(line).event).filter((event) => event === "worker.ready"),
    ).toHaveLength(1);
    expect(lines.map((line) => JSON.parse(line).event)).toContain("worker.stopped");
  });
});

it.each(["SIGTERM", "SIGINT"] as const)(
  "actual worker entrypoint drains and exits on %s",
  async (signal) => {
    const worker = fork(fileURLToPath(new URL("../../main.ts", import.meta.url)), [], {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        WORKER_DATABASE_URL: pg.adminUri,
        WORKER_SCHEDULER_SCHEMA: "worker_lifecycle",
        WORKER_SCHEDULER_MIGRATE: "false",
      },
      stdio: ["ignore", "pipe", "inherit", "ipc"],
    });
    let output = "";
    worker.stdout!.on("data", (data: Buffer) => {
      output += data.toString();
    });
    try {
      await expect
        .poll(() => output.includes('"event":"worker.ready"'), { timeout: 15000 })
        .toBe(true);
      const exited = once(worker, "exit", { signal: AbortSignal.timeout(15000) });
      worker.kill(signal);
      expect(await exited).toEqual([0, null]);
      expect(output).toContain('"event":"worker.stopped"');
    } finally {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
    }
  },
);

it("pg-boss owns terminal-job retention cleanup through its supported supervisor", async () => {
  await boss.createQueue("retention", { deleteAfterSeconds: 1 });
  await boss.work("retention", { pollingIntervalSeconds: 0.5 }, async () => {});
  const id = await boss.send("retention");
  await expect
    .poll(async () => (await boss.findJobs("retention", { id: id! }))[0]?.state, {
      timeout: 10000,
      interval: 50,
    })
    .toBe("completed");
  await expect
    .poll(
      async () => {
        await boss.supervise("retention");
        return (await boss.findJobs("retention", { id: id! })).length;
      },
      { timeout: 15000, interval: 250 },
    )
    .toBe(0);
});
it("foundation terminal failures are exposed by the bounded inspection and log seam", async () => {
  const lines: string[] = [];
  const runner = createScheduler(
    pg.adminUri,
    "inspection_test",
    true,
    createLogger({ sink: (line) => lines.push(line) }),
  );
  await runner.start({
    "expired-sessions": async () => {
      throw new Error("inspection proof");
    },
    "expired-invitations": async () => {},
    "outbox-retention": async () => {},
  });
  const sender = new PgBoss({
    connectionString: pg.adminUri,
    schema: "inspection_test",
    migrate: false,
  });
  sender.on("error", (error) => {
    throw error;
  });
  await sender.start();
  try {
    const id = await sender.send("expired-sessions", {}, { retryLimit: 0 });
    await expect
      .poll(() => runner.inspectFailures(1), { timeout: 15000 })
      .toEqual([{ queue: "expired-sessions", id, retryCount: 0 }]);
    expect(lines.some((line) => JSON.parse(line).event === "scheduler.terminal_failures")).toBe(
      true,
    );
  } finally {
    await sender.stop();
    await runner.stop();
  }
});
