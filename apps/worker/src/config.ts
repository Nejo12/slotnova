import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveEnvironment, isHosted } from "@slotnova/deployment-config";
import { resolveDbConfig, type Env } from "@slotnova/db";

const positive = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);
const workerSchema = z.object({
  WORKER_SCHEDULER_SCHEMA: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,49}$/)
    .refine((s) => s !== "public")
    .default("pgboss"),
  WORKER_SCHEDULER_MIGRATE: z.enum(["true", "false"]).default("false"),
  WORKER_DATABASE_CONNECTION_MODE: z.literal("direct").optional(),
  WORKER_BATCH_SIZE: positive(50, 1000),
  WORKER_MAX_ATTEMPTS: positive(5, 100),
  WORKER_POLL_INTERVAL_MS: positive(1000, 60000),
  WORKER_RETENTION_DAYS: positive(30, 3650),
  WORKER_SCHEDULER_POOL_MAX: positive(10, 100),
});
export function resolveWorkerConfig(env: Env = process.env) {
  const environment = resolveEnvironment(env);
  const result = workerSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid worker configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const value = result.data;
  if (isHosted(environment) || env["NODE_ENV"] === "production") {
    if (value.WORKER_SCHEDULER_MIGRATE === "true")
      throw new Error("Scheduler migrations require an explicit release step");
    if (value.WORKER_DATABASE_CONNECTION_MODE !== "direct")
      throw new Error("WORKER_DATABASE_CONNECTION_MODE=direct is required for advisory locks");
    if (env["SCHEDULER_MIGRATION_URL"] || env["DATABASE_MIGRATION_URL"] || env["DATABASE_URL"])
      throw new Error("Worker runtime must receive only its own database credential");
  }
  const db = resolveDbConfig("app", {
    ...env,
    DATABASE_URL: env["WORKER_DATABASE_URL"],
    DATABASE_CONNECTION_MODE: value.WORKER_DATABASE_CONNECTION_MODE,
  });
  const url = new URL(db.connectionString);
  if (["6432", "6543"].includes(url.port) || url.hostname.includes("-pooler"))
    throw new Error("Worker advisory locks require a direct session endpoint");
  return {
    environment,
    enforceRuntimeRole: isHosted(environment) || env["NODE_ENV"] === "production",
    db,
    connectionString: db.connectionString,
    instanceId: env["WORKER_INSTANCE_ID"]?.trim() || randomUUID(),
    schema: value.WORKER_SCHEDULER_SCHEMA,
    migrate: value.WORKER_SCHEDULER_MIGRATE === "true",
    batchSize: value.WORKER_BATCH_SIZE,
    maxAttempts: value.WORKER_MAX_ATTEMPTS,
    pollIntervalMs: value.WORKER_POLL_INTERVAL_MS,
    retentionDays: value.WORKER_RETENTION_DAYS,
    schedulerPoolMax: value.WORKER_SCHEDULER_POOL_MAX,
  };
}
