import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { startPostgres, type PostgresHarness } from "../pg-container.js";
import { withIsolatedDatabase } from "../isolation.js";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../../../dist/bin/migrate.js", import.meta.url));
let pg: PostgresHarness;
beforeAll(async () => {
  pg = await startPostgres();
});
afterAll(async () => {
  await pg?.stop();
});
async function migrate(uri: string, args: string[] = []) {
  return exec(process.execPath, [cli, ...args], {
    env: {
      PATH: process.env["PATH"],
      SLOTNOVA_ENV: "preview",
      DATABASE_MIGRATION_URL: uri,
      DATABASE_SSL: "disable",
    },
  });
}
async function ordinaryMigrator(database: string, adminUri: string) {
  const admin = new Client({ connectionString: adminUri });
  await admin.connect();
  try {
    await admin.query(
      "DO $$ BEGIN CREATE ROLE release_migrator LOGIN PASSWORD 'test_only' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    );
    await admin.query(`GRANT CREATE ON DATABASE "${database}" TO release_migrator`);
    await admin.query("GRANT USAGE, CREATE ON SCHEMA public TO release_migrator");
  } finally {
    await admin.end();
  }
  const uri = new URL(adminUri);
  uri.username = "release_migrator";
  uri.password = "test_only";
  return uri.toString();
}
describe("explicit migration release CLI", () => {
  it("applies all real migrations on a clean database using a separate ordinary migration role", async () => {
    await withIsolatedDatabase(pg.adminUri, async ({ databaseName, databaseUri }) => {
      const uri = await ordinaryMigrator(databaseName, databaseUri);
      expect((await migrate(uri)).stdout).toContain("applied 6 migration(s)");
      expect((await migrate(uri)).stdout).toContain("no migrations applied");
      expect((await migrate(uri, ["--dry-run"])).stdout).toContain("no pending migrations");
      const appUri = new URL(pg.appUri);
      appUri.pathname = new URL(databaseUri).pathname;
      await expect(migrate(appUri.toString())).rejects.toMatchObject({ code: 1 });
    });
  });
  it("forwards a populated foundation schema without losing rows or weakening FORCE RLS", async () => {
    await withIsolatedDatabase(pg.adminUri, async ({ databaseName, databaseUri }) => {
      const uri = await ordinaryMigrator(databaseName, databaseUri);
      await migrate(uri, ["--to", "0003"]);
      const admin = new Client({ connectionString: databaseUri });
      await admin.connect();
      try {
        await admin.query(
          "INSERT INTO users(id,email,display_name) VALUES ('10000000-0000-4000-8000-000000000001','release@example.test','Release'); INSERT INTO workspaces(id,name,slug) VALUES ('20000000-0000-4000-8000-000000000001','Release','release'); INSERT INTO memberships(workspace_id,user_id,role) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner')",
        );
        expect((await migrate(uri)).stdout).toContain("applied 3 migration(s)");
        expect((await admin.query("SELECT count(*)::int AS n FROM memberships")).rows[0].n).toBe(1);
        const appUri = new URL(pg.appUri);
        appUri.pathname = new URL(databaseUri).pathname;
        const app = new Client({ connectionString: appUri.toString() });
        await app.connect();
        try {
          expect((await app.query("SELECT * FROM memberships")).rowCount).toBe(0);
          await app.query(
            "BEGIN; SELECT set_config('app.user_id','10000000-0000-4000-8000-000000000001',true)",
          );
          expect((await app.query("SELECT * FROM memberships")).rowCount).toBe(1);
          await app.query("ROLLBACK");
          expect((await app.query("SELECT * FROM memberships")).rowCount).toBe(0);
          expect(
            (
              await app.query(
                "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='memberships'::regclass",
              )
            ).rows[0],
          ).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
        } finally {
          await app.end();
        }
        await admin.query("UPDATE schema_migrations SET checksum='corrupt' WHERE version='0001'");
        await expect(migrate(uri)).rejects.toMatchObject({ code: 1 });
      } finally {
        await admin.end();
      }
    });
  });
});
