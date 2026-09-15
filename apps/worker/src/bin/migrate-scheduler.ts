/** Explicit release entry point; never imported by worker startup. */
import { PgBoss } from "pg-boss";
import { Client, resolveDbConfig } from "@slotnova/db";
import { resolveEnvironment } from "@slotnova/deployment-config";

async function main(): Promise<void> {
  resolveEnvironment(process.env);
  const schema = process.env["WORKER_SCHEDULER_SCHEMA"] ?? "pgboss";
  const owner = process.env["SCHEDULER_OWNER_ROLE"];
  if (
    !/^[a-z][a-z0-9_]{0,49}$/.test(schema) ||
    schema === "public" ||
    !owner ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(owner)
  )
    throw new Error("Explicit scheduler schema/owner role required");
  const config = resolveDbConfig("migration", {
    ...process.env,
    DATABASE_MIGRATION_URL: process.env["SCHEDULER_MIGRATION_URL"],
  });
  const client = new Client({
    connectionString: config.connectionString,
    ssl: config.ssl,
    application_name: "slotnova-scheduler-release",
    connectionTimeoutMillis: config.connectionTimeoutMillis,
  });
  await client.connect();
  let boss: PgBoss | undefined;
  try {
    await client.query(`SET ROLE "${owner}"`);
    // Bootstrap owns role/schema creation; release only installs/upgrades within that schema.
    const result = await client.query(
      "SELECT 1 FROM pg_namespace WHERE nspname=$1 AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)",
      [schema],
    );
    if (!result.rowCount)
      throw new Error("Scheduler schema must be precreated and owned by SCHEDULER_OWNER_ROLE");
    boss = new PgBoss({
      schema,
      createSchema: false,
      migrate: true,
      supervise: false,
      schedule: false,
      db: { executeSql: (text, values) => client.query(text, values) },
    });
    boss.on("error", () => {
      process.exitCode = 1;
    });
    await boss.start();
    process.stdout.write("Scheduler schema provisioned at the pinned pg-boss version\n");
  } finally {
    await boss?.stop();
    await client.end();
  }
}
main().catch(() => {
  process.stderr.write("Scheduler release failed; inspect restricted database logs\n");
  process.exitCode = 1;
});
