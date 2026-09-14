/**
 * T067 -- contract tests for `GET /healthz` / `GET /readyz`
 * (`contracts/health.contract.md`): success-path schema validation +
 * problem+json validation for the documented 503 failure mode.
 *
 * `health/` has no `*.schema.ts` file of its own (T064's Zod migration
 * scope was the identity HTTP boundary only -- `docs/decisions/
 * 0004-validation-contract-integration.md`; `HealthController` still
 * returns a plain `HealthzResponse`/`ReadyzResponse` interface, not a Zod
 * DTO). This file's local schemas are therefore a structural mirror of
 * `contracts/health.contract.md`'s documented shape for contract-test
 * purposes only -- they intentionally do not become a new production
 * schema file (out of scope for a test-only task; would require touching
 * `health.controller.ts`, which T067 must not do).
 */
import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  expectGeneratedProblemResponse,
  expectProblemJson,
} from "../../../../http/problem/__tests__/expect-problem-json.js";
import { createApp } from "../../../../main.js";

const healthzResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  time: z.string(),
});

const readyzResponseSchema = z.object({
  status: z.literal("ready"),
  checks: z.object({
    database: z.string(),
    migrations: z.string(),
    outbox: z.string(),
  }),
  time: z.string(),
});

describe("health/readiness contract (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  it("GET /healthz success body validates against the documented schema", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    healthzResponseSchema.parse(response.json());
  });

  it("GET /readyz success body validates against the documented schema", async () => {
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    readyzResponseSchema.parse(response.json());
  });

  it("GET /readyz is 503 problem+json (not-ready) when a migration has not been applied", async () => {
    await admin.query("DELETE FROM public.schema_migrations WHERE version = $1", ["0001"]);
    try {
      const response = await app.inject({ method: "GET", url: "/readyz" });
      expectProblemJson(response, { status: 503, slug: "not-ready" });
      // Second assertion (PR-15 review fix): proves this response also
      // matches the GENERATED OpenAPI contract, not just the hand-written
      // helper above -- see `expect-problem-json.ts`'s doc comment.
      expectGeneratedProblemResponse(response, { path: "/readyz", method: "get", status: 503 });
      expect(response.json().checks.migrations).not.toBe("current");
    } finally {
      await admin.query(
        `INSERT INTO public.schema_migrations (version, name, checksum)
         VALUES ('0001', 'platform_outbox', 'restored-by-test')
         ON CONFLICT (version) DO NOTHING`,
      );
    }
  });
});
