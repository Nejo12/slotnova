import { describe, expect, it } from "vitest";
import { PgBoss } from "pg-boss";
import { resolveWorkerConfig } from "../config.js";
import { handleIdentityEvent } from "../outbox/handlers/identity.js";
import type { PoolClient } from "@slotnova/db";

describe("worker configuration and foundation boundary", () => {
  it("uses the verified pg-boss 12.31.1 named constructor export", () => {
    expect(new PgBoss("postgres://localhost/test")).toBeInstanceOf(PgBoss);
  });
  it("requires an explicit DB and validates bounded config", () => {
    expect(() => resolveWorkerConfig({})).toThrow();
    const env = { SLOTNOVA_ENV: "local", WORKER_DATABASE_URL: "postgres://worker@localhost/test" };
    expect(resolveWorkerConfig(env)).toMatchObject({
      maxAttempts: 5,
      migrate: false,
      retentionDays: 30,
    });
    expect(() => resolveWorkerConfig({ ...env, WORKER_BATCH_SIZE: "0" })).toThrow();
    expect(() => resolveWorkerConfig({ ...env, WORKER_SCHEDULER_SCHEMA: "public" })).toThrow();
  });
  it("rejects unsupported events and safely repeats current foundation events", async () => {
    const event = {
      id: "id",
      workspace_id: null,
      event_name: "membership.created",
      event_version: 1,
      payload: { requestId: "request", membershipId: "member", role: "staff" },
      attempts: 1,
    };
    const client = {} as PoolClient;
    await expect(handleIdentityEvent(event, client)).resolves.toBeUndefined();
    await expect(handleIdentityEvent(event, client)).resolves.toBeUndefined();
    await expect(
      handleIdentityEvent({ ...event, event_name: "booking.created" }, client),
    ).rejects.toThrow();
  });
});
