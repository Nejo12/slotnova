import { PgBoss } from "pg-boss";
import type { Queryable, DbConnectionConfig } from "@slotnova/db";
import type { Logger } from "@slotnova/observability-server";

export const FOUNDATION_QUEUES = [
  "expired-sessions",
  "expired-invitations",
  "outbox-retention",
] as const;
export type FoundationQueue = (typeof FOUNDATION_QUEUES)[number];
export const RETRY_POLICY = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 900,
  retentionSeconds: 604800,
  deleteAfterSeconds: 2592000,
} as const;

export function createScheduler(
  connectionString: string,
  schema: string,
  migrate: boolean,
  logger: Logger,
  ssl: DbConnectionConfig["ssl"] = false,
  poolOptions: { max?: number; connectionTimeoutMillis?: number; statement_timeout?: number } = {},
) {
  if (!/^[a-z][a-z0-9_]{0,49}$/.test(schema) || schema === "public")
    throw new Error("invalid scheduler schema");
  const boss = new PgBoss({ connectionString, schema, migrate, ssl, ...poolOptions });
  boss.on("error", () => logger.error("scheduler.error"));
  boss.on("warning", () => logger.warn("scheduler.warning"));
  const activeQueues: FoundationQueue[] = [];
  return {
    async start(handlers: Record<FoundationQueue, () => Promise<void>>) {
      await boss.start();
      for (const name of FOUNDATION_QUEUES) {
        await boss.createQueue(name, RETRY_POLICY);
        await boss.updateQueue(name, RETRY_POLICY);
        await boss.work(name, { batchSize: 1 }, async () => {
          await handlers[name]();
        });
        activeQueues.push(name);
        await boss.schedule(name, "0 * * * *", {}, { tz: "UTC", ...RETRY_POLICY });
      }
    },
    stop: async () => {
      for (const name of activeQueues) await boss.offWork(name, { wait: true });
      await boss.stop({ graceful: true, timeout: 30000 });
    },
    /** Supported transaction adapter, scoped to foundation queue names. Caller
     * owns BEGIN/COMMIT; scheduler options never leak into domain code. */
    enqueue: (name: FoundationQueue, tx?: Queryable) =>
      boss.send(
        name,
        {},
        {
          ...RETRY_POLICY,
          ...(tx
            ? { db: { executeSql: (text: string, values?: unknown[]) => tx.query(text, values) } }
            : {}),
        },
      ),
    async inspectFailures(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
        throw new Error("invalid failure inspection limit");
      const failures = [];
      for (const name of FOUNDATION_QUEUES) {
        const result = await boss
          .getDb()
          .executeSql(
            `SELECT id, retry_count AS "retryCount" FROM "${schema}".job WHERE name = $1 AND state = 'failed' ORDER BY completed_on DESC LIMIT $2`,
            [name, limit],
          );
        const jobs = result.rows as { id: string; retryCount: number }[];
        for (const job of jobs)
          failures.push({ queue: name, id: job.id, retryCount: job.retryCount });
      }
      if (failures.length)
        logger.error("scheduler.terminal_failures", { meta: { count: failures.length } });
      return failures;
    },
  };
}
