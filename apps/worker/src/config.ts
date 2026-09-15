import { randomUUID } from "node:crypto";
import { resolveDbConfig, type Env } from "@slotnova/db";

export function resolveWorkerConfig(env: Env = process.env) {
  const positive = (name: string, fallback: number, max: number) => {
    const raw = env[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error(`invalid ${name}`);
    return value;
  };
  const schema = env["WORKER_SCHEDULER_SCHEMA"] ?? "pgboss";
  if (!/^[a-z][a-z0-9_]{0,49}$/.test(schema) || schema === "public")
    throw new Error("invalid WORKER_SCHEDULER_SCHEMA");
  const migrate = env["WORKER_SCHEDULER_MIGRATE"] ?? "false";
  if (migrate !== "true" && migrate !== "false")
    throw new Error("invalid WORKER_SCHEDULER_MIGRATE");
  const db = resolveDbConfig("app", { ...env, DATABASE_URL: env["WORKER_DATABASE_URL"] });
  if (env["NODE_ENV"] === "production" && migrate === "true")
    throw new Error("production scheduler migrations require an explicit release step");
  return {
    db,
    // Separate worker credential; reuse existing validation without borrowing
    // the migration credential. Provisioning remains T072+.
    connectionString: db.connectionString,
    instanceId: env["WORKER_INSTANCE_ID"]?.trim() || randomUUID(),
    schema,
    migrate: migrate === "true",
    batchSize: positive("WORKER_BATCH_SIZE", 50, 1000),
    maxAttempts: positive("WORKER_MAX_ATTEMPTS", 5, 100),
    pollIntervalMs: positive("WORKER_POLL_INTERVAL_MS", 1000, 60000),
    retentionDays: positive("WORKER_RETENTION_DAYS", 30, 3650),
  };
}
