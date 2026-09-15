import { describe, expect, it } from "vitest";
import { resolveWorkerConfig } from "../config.js";
const env = {
  SLOTNOVA_ENV: "production",
  DATABASE_SSL: "require",
  WORKER_DATABASE_CONNECTION_MODE: "direct",
  WORKER_DATABASE_URL: "postgres://worker:placeholder@db.invalid/db",
};
describe("worker deployment boundary", () => {
  it("accepts a distinct direct credential with separate bounded pools", () => {
    expect(resolveWorkerConfig(env)).toMatchObject({
      environment: "production",
      migrate: false,
      schedulerPoolMax: 10,
    });
  });
  it.each([
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { SCHEDULER_MIGRATION_URL: "postgres://scheduler@db/db" },
    { SLOTNOVA_ENV: "unknown" },
    { SLOTNOVA_ENV: undefined },
    { WORKER_DATABASE_URL: undefined },
    { WORKER_DATABASE_CONNECTION_MODE: "transaction" },
    { WORKER_DATABASE_CONNECTION_MODE: "session" },
    { WORKER_DATABASE_CONNECTION_MODE: undefined },
    { WORKER_SCHEDULER_MIGRATE: "true" },
    { WORKER_DATABASE_URL: "postgres://worker:placeholder@db-pooler.invalid/db" },
    { WORKER_DATABASE_URL: "postgres://worker:placeholder@db.invalid:6543/db" },
    { DATABASE_SSL: "disable" },
    { DATABASE_SSL: "no-verify" },
    { WORKER_SCHEDULER_POOL_MAX: "1000" },
    { DATABASE_MIGRATION_URL: "postgres://migration@db/db" },
    { DATABASE_URL: "postgres://app@db/db" },
  ])("rejects unsafe worker settings %j", (override) =>
    expect(() => resolveWorkerConfig({ ...env, ...override })).toThrow(),
  );
});
