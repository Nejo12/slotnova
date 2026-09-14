import { PgBoss } from "pg-boss";
import { Pool } from "@slotnova/db";
const uri = process.env["TEST_DATABASE_URL"]!;
const pool = new Pool({ connectionString: uri });
const boss = new PgBoss({ connectionString: uri, schema: "scheduler_test", migrate: false });
boss.on("error", (error) => {
  console.error(error);
});
await boss.start();
await boss.work("delayed", { pollingIntervalSeconds: 0.5 }, async (jobs) => {
  for (const job of jobs)
    await pool.query("INSERT INTO scheduled_effects(id) VALUES($1) ON CONFLICT DO NOTHING", [
      job.id,
    ]);
});
process.send?.("ready");
const stop = () => {
  void boss
    .stop({ graceful: true })
    .then(() => pool.end())
    .then(() => process.disconnect());
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
