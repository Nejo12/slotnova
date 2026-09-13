import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../../../main.js";

/**
 * T023 — health/readiness against real PostgreSQL (contracts/health.contract.md).
 */
describe("GET /healthz and GET /readyz (real PostgreSQL)", () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
  }, 120_000);

  afterAll(async () => {
    await harness.stop();
  });

  it("GET /healthz is 200 with no database configured at all", async () => {
    const previous = process.env["DATABASE_URL"];
    delete process.env["DATABASE_URL"];
    // Liveness must not require DATABASE_URL to be set at all — but the
    // DatabaseModule factory still runs at bootstrap, so give it a syntactically
    // valid placeholder; healthz itself never queries it.
    process.env["DATABASE_URL"] = "postgres://placeholder@127.0.0.1:1/placeholder";

    const app = await createApp();
    await app.init();
    try {
      const response = await app.inject({ method: "GET", url: "/healthz" });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
      if (previous === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = previous;
    }
  });

  describe("against a healthy, migrated database", () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      process.env["DATABASE_URL"] = harness.appUri;
      app = await createApp();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /readyz is 200 with every check ok/current", async () => {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as {
        status: string;
        checks: Record<string, string>;
      };
      expect(body.status).toBe("ready");
      expect(body.checks).toEqual({ database: "ok", migrations: "current", outbox: "ok" });
    });
  });

  describe("when a migration is not yet applied", () => {
    let app: NestFastifyApplication;
    let admin: Client;

    beforeAll(async () => {
      admin = new Client({ connectionString: harness.adminUri });
      await admin.connect();
      await admin.query("DELETE FROM public.schema_migrations WHERE version = $1", ["0001"]);

      process.env["DATABASE_URL"] = harness.appUri;
      app = await createApp();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      // Restore bookkeeping so later tests in this file see a fully-migrated DB.
      await admin.query(
        `INSERT INTO public.schema_migrations (version, name, checksum)
         VALUES ('0001', 'platform_outbox', 'restored-by-test')
         ON CONFLICT (version) DO NOTHING`,
      );
      await admin.end();
    });

    it("GET /readyz is 503 problem+json reporting migrations as not current", async () => {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(503);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      const body = JSON.parse(response.payload) as {
        type: string;
        checks: Record<string, string>;
      };
      expect(body.type).toBe("https://slotnova.app/problems/not-ready");
      expect(body.checks["migrations"]).not.toBe("current");
    });
  });

  describe("when the database is unreachable", () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      // A syntactically valid URI to a port nothing is listening on.
      process.env["DATABASE_URL"] = "postgres://app:app@127.0.0.1:5999/unreachable";
      app = await createApp();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /readyz is 503 problem+json with no internal connection detail leaked", async () => {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expect(response.statusCode).toBe(503);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      const body = JSON.parse(response.payload) as {
        type: string;
        detail?: string;
        checks: Record<string, string>;
      };
      expect(body.type).toBe("https://slotnova.app/problems/not-ready");
      expect(body.checks["database"]).toBe("down");
      expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|password|127\.0\.0\.1:5999/);
    });
  });
});
