import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgBoss } from "pg-boss";
import { Client, runMigrations, assertRuntimeDatabaseRole } from "@slotnova/db";
import { startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { createWorker } from "../../worker.js";
import { resolveWorkerConfig } from "../../config.js";
const exec = promisify(execFile);
let pg: PostgresHarness;
let admin: Client;
function uri(role: string) {
  const u = new URL(pg.adminUri);
  u.username = role;
  u.password = "test_only";
  return u.toString();
}
const releaseCli = fileURLToPath(
  new URL("../../../dist/bin/migrate-scheduler.js", import.meta.url),
);
async function provision(role = "scheduler_release") {
  return exec(process.execPath, [releaseCli], {
    env: {
      PATH: process.env["PATH"],
      SLOTNOVA_ENV: "preview",
      DATABASE_SSL: "disable",
      SCHEDULER_MIGRATION_URL: uri(role),
      SCHEDULER_OWNER_ROLE: "slotnova_scheduler_owner",
    },
  });
}
beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations({ connectionString: pg.adminUri });
  admin = new Client({ connectionString: pg.adminUri });
  await admin.connect();
  await admin.query(`CREATE ROLE slotnova_scheduler_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE no_scheduler_access LOGIN PASSWORD 'test_only' NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE scheduler_release LOGIN PASSWORD 'test_only' NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE slotnova_worker LOGIN PASSWORD 'test_only' NOSUPERUSER NOBYPASSRLS;
    GRANT slotnova_scheduler_owner TO scheduler_release, slotnova_worker;
    GRANT slotnova_app TO slotnova_worker;
    CREATE SCHEMA pgboss AUTHORIZATION slotnova_scheduler_owner;
    GRANT SELECT, UPDATE, DELETE ON outbox_records TO slotnova_worker;
    GRANT SELECT, DELETE ON sessions TO slotnova_worker;
    GRANT SELECT ON workspaces TO slotnova_worker;`);
});
afterAll(async () => {
  await admin?.end();
  await pg?.stop();
});
describe("separate scheduler release and runtime role", () => {
  it("requires explicit schema ownership, provisions idempotently and starts the ordinary worker", async () => {
    await expect(provision("no_scheduler_access")).rejects.toMatchObject({ code: 1 });
    expect((await provision()).stdout).toContain("Scheduler schema provisioned");
    expect((await provision()).stdout).toContain("Scheduler schema provisioned");
    const workerClient = new Client({ connectionString: uri("slotnova_worker") });
    await workerClient.connect();
    try {
      await assertRuntimeDatabaseRole(workerClient);
      await expect(
        workerClient.query("ALTER TABLE users ADD COLUMN forbidden text"),
      ).rejects.toMatchObject({ code: "42501" });
      await workerClient.query("BEGIN; SET LOCAL ROLE slotnova_app");
      expect((await workerClient.query("SELECT current_user")).rows[0].current_user).toBe(
        "slotnova_app",
      );
      await workerClient.query("ROLLBACK");
    } finally {
      await workerClient.end();
    }
    const worker = createWorker({
      config: resolveWorkerConfig({
        SLOTNOVA_ENV: "preview",
        WORKER_DATABASE_URL: uri("slotnova_worker"),
        WORKER_SCHEDULER_MIGRATE: "false",
      }),
      sink: () => {},
    });
    await worker.start();
    await worker.stop();
    const boss = new PgBoss({ connectionString: uri("slotnova_worker"), migrate: false });
    boss.on("error", () => {});
    try {
      await boss.start();
      await boss.createQueue("release-proof", { partition: true });
      const id = await boss.send("release-proof", {});
      expect(id).toBeTruthy();
      const jobs = await boss.fetch("release-proof");
      expect(jobs[0]?.id).toBe(id);
      await boss.complete("release-proof", id!);
    } finally {
      await boss.stop();
    }
    const ownership = await admin.query(
      "SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pgboss' AND relname='version'",
    );
    expect(ownership.rows).toEqual([{ owner: "slotnova_scheduler_owner" }]);
  });
  it("rejects an app principal that can assume a business owner even without BYPASSRLS", async () => {
    await admin.query(
      "CREATE ROLE unsafe_owner LOGIN PASSWORD 'test_only' NOSUPERUSER NOBYPASSRLS; CREATE TABLE public.owner_probe(id int); ALTER TABLE owner_probe OWNER TO unsafe_owner; GRANT unsafe_owner TO slotnova_app",
    );
    const app = new Client({ connectionString: pg.appUri });
    await app.connect();
    try {
      await expect(assertRuntimeDatabaseRole(app)).rejects.toThrow("business ownership");
    } finally {
      await app.end();
      await admin.query("REVOKE unsafe_owner FROM slotnova_app");
    }
  });
});
