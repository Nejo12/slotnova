import { Pool, assertRuntimeDatabaseRole } from "@slotnova/db";
import { createIdentityMaintenance } from "@slotnova/api/identity-maintenance";
import { createLogger, type Logger, type LoggerOptions } from "@slotnova/observability-server";
import { resolveWorkerConfig } from "./config.js";
import { startConsumer } from "./outbox/consumer.js";
import { createScheduler } from "./scheduler/runner.js";
import { expiredSessions } from "./scheduler/jobs/expired-sessions.js";
import { expiredInvitations } from "./scheduler/jobs/expired-invitations.js";
import { outboxRetention } from "./scheduler/jobs/outbox-retention.js";

export interface WorkerOptions {
  sink?: LoggerOptions["sink"];
  logger?: Logger;
  config?: ReturnType<typeof resolveWorkerConfig>;
}

export function createWorker(options: WorkerOptions = {}) {
  const config = options.config ?? resolveWorkerConfig();
  const logger =
    options.logger ??
    createLogger({ base: { service: "worker" }, ...(options.sink ? { sink: options.sink } : {}) });
  const pool = new Pool({
    connectionString: config.connectionString,
    max: Math.max(4, config.db.poolMax),
    ssl: config.db.ssl,
    connectionTimeoutMillis: config.db.connectionTimeoutMillis,
    idleTimeoutMillis: config.db.idleTimeoutMillis,
    application_name: config.db.applicationName,
    ...(config.db.statementTimeoutMillis === undefined
      ? {}
      : { statement_timeout: config.db.statementTimeoutMillis }),
  });
  pool.on("error", () => logger.error("worker.pool_error"));
  const scheduler = createScheduler(
    config.connectionString,
    config.schema,
    config.migrate,
    logger,
    config.db.ssl,
    {
      max: config.schedulerPoolMax,
      connectionTimeoutMillis: config.db.connectionTimeoutMillis,
      ...(config.db.statementTimeoutMillis === undefined
        ? {}
        : { statement_timeout: config.db.statementTimeoutMillis }),
    },
  );
  let consumer: Awaited<ReturnType<typeof startConsumer>> | undefined;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closePromise ??= (async () => {
      try {
        await consumer?.stop();
      } finally {
        try {
          await scheduler.stop();
        } finally {
          await pool.end();
        }
      }
    })());
  const stop = (): Promise<void> =>
    (stopPromise ??= (async () => {
      await startPromise?.catch(() => {});
      await close();
      logger.info("worker.stopped");
    })());

  return {
    start: (): Promise<void> => {
      if (stopPromise) return Promise.reject(new Error("worker is stopped"));
      return (startPromise ??= (async () => {
        const identity = createIdentityMaintenance(pool);
        try {
          if (config.enforceRuntimeRole) {
            const client = await pool.connect();
            try {
              await assertRuntimeDatabaseRole(client);
            } finally {
              client.release();
            }
          }
          await scheduler.start({
            "expired-sessions": expiredSessions(identity, config.batchSize, config.retentionDays),
            "expired-invitations": expiredInvitations(identity, config.batchSize),
            "outbox-retention": outboxRetention(pool, config.batchSize, config.retentionDays),
          });
          consumer = await startConsumer({ ...config, pool, logger });
          void consumer.done.catch(() => {
            process.exitCode = 1;
            void stop().catch(() => logger.error("worker.shutdown_failed"));
          });
          logger.info("worker.ready");
        } catch (error) {
          logger.error("worker.startup_failed");
          await close();
          throw error;
        }
      })());
    },
    stop,
  };
}
