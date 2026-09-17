/**
 * Contract tests for `/v1/scheduling/*` (PR-04, issue #66,
 * `contracts/scheduling.contract.md`), mirroring the pattern
 * `catalog/http/__tests__/catalog.contract.test.ts` established:
 *
 * 1. every success body is parsed with the SAME Zod schema object
 *    `@ZodResponse` published to the OpenAPI document — not a hand-written
 *    expectation of it;
 * 2. every documented failure is asserted to be valid `problem+json` AND to
 *    match what the committed generated document declares for that exact
 *    path/method/status (`expectGeneratedProblemResponse`);
 * 3. the generated document is asserted to contain exactly the four endpoints
 *    this PR is scoped to — no Booking, Calendar, resource, location or staff
 *    route may appear.
 *
 * `contracts:check` separately proves the committed document matches what
 * `openapi:generate` produces from current source, so asserting against the
 * committed artifact here is asserting against the real generated contract.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import {
  expectGeneratedProblemResponse,
  expectProblemJson,
} from "../../../../http/problem/__tests__/expect-problem-json.js";
import { createApp } from "../../../../main.js";
import { sessionCookieName } from "../../../identity/application/session/session-cookie.js";
import { SessionService } from "../../../identity/application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../../identity/domain/ids.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { SCHEDULING_MANAGE, SCHEDULING_READ } from "../../domain/policy/capabilities.js";
import {
  availabilityExceptionResponseSchema,
  availabilityPatternListResponseSchema,
  availabilityPatternResponseSchema,
  resolveAvailabilityResponseSchema,
} from "../scheduling.schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolvePath(__dirname, "../../../../../openapi/openapi.json");

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

const WEEKDAY_RULE = [{ dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 1020 }];

describe("/v1/scheduling contract", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  let manager: { workspaceId: string; cookie: string };
  let readOnly: { workspaceId: string; cookie: string };

  let counter = 0;

  async function seedActor(
    permissions: readonly string[],
  ): Promise<{ workspaceId: string; cookie: string }> {
    const suffix = `${Date.now()}-${(counter += 1)}`;
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Scheduling contract ${suffix}`, `scheduling-contract-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Scheduling Contract', 'active') RETURNING id`,
      [`scheduling-contract-${suffix}@example.test`],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status, permissions)
       VALUES ($1, $2, 'admin', 'active', $3)`,
      [workspace.rows[0]!.id, user.rows[0]!.id, [...permissions]],
    );
    const issued = await sessions.issue({
      userId: user.rows[0]!.id as UserId,
      activeWorkspaceId: workspace.rows[0]!.id as WorkspaceId,
    });
    return {
      workspaceId: workspace.rows[0]!.id,
      cookie: `${SESSION_COOKIE}=${issued.rawToken}`,
    };
  }

  async function stateHeaders(cookie: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const csrf = res.cookies.find((c) => c.name === CSRF_COOKIE)!;
    return {
      cookie: `${cookie}; ${csrf.name}=${csrf.value}`,
      "x-csrf-token": csrf.value,
    };
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();
    sessions = app.get(SessionService);

    manager = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
    readOnly = await seedActor([SCHEDULING_READ]);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  it("publishes exactly the four PR-04 Scheduling operations and no deferred surface", () => {
    const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiDocument;
    const operations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith("/v1/scheduling"))
      .flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

    expect(operations).toEqual([
      "GET /v1/scheduling/availability-patterns",
      "POST /v1/scheduling/availability-exceptions",
      "POST /v1/scheduling/availability-patterns",
      "POST /v1/scheduling/availability/resolve",
    ]);

    const joined = operations.join(" ");
    for (const forbidden of ["PATCH", "PUT", "DELETE", "booking", "calendar", "slots"]) {
      expect(joined.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }

    // Founder-deferred dimensions (spec.md Clarifications 3 & 4) must not
    // appear anywhere in the Scheduling contract surface.
    const schedulingContract = JSON.stringify(
      Object.fromEntries(
        Object.entries(document.paths).filter(([path]) => path.startsWith("/v1/scheduling")),
      ),
    );
    for (const forbidden of ["resourceId", "locationId", "staffId", "bookingId"]) {
      expect(schedulingContract, forbidden).not.toContain(forbidden);
    }
  });

  it("success bodies validate against the published response schemas", async () => {
    const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);

    const created = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-patterns",
      headers: await stateHeaders(actor.cookie),
      payload: { timezone: "Europe/London", weeklyRule: WEEKDAY_RULE },
    });
    expect(created.statusCode).toBe(201);
    availabilityPatternResponseSchema.parse(created.json());

    const list = await app.inject({
      method: "GET",
      url: "/v1/scheduling/availability-patterns",
      headers: { cookie: actor.cookie },
    });
    expect(list.statusCode).toBe(200);
    availabilityPatternListResponseSchema.parse(list.json());

    const exception = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-exceptions",
      headers: await stateHeaders(actor.cookie),
      payload: { startsAt: "2026-09-07T10:00:00Z", endsAt: "2026-09-07T12:00:00Z" },
    });
    expect(exception.statusCode).toBe(201);
    availabilityExceptionResponseSchema.parse(exception.json());

    const resolved = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability/resolve",
      headers: await stateHeaders(actor.cookie),
      payload: { from: "2026-09-07", to: "2026-09-14" },
    });
    expect(resolved.statusCode).toBe(200);
    resolveAvailabilityResponseSchema.parse(resolved.json());
  });

  it("401 (no session) is documented problem+json on the read and on a write", async () => {
    const read = await app.inject({
      method: "GET",
      url: "/v1/scheduling/availability-patterns",
    });
    expectProblemJson(read, { status: 401, slug: "session-invalid" });
    expectGeneratedProblemResponse(read, {
      path: "/v1/scheduling/availability-patterns",
      method: "get",
      status: 401,
    });

    const write = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-patterns",
      headers: await stateHeaders(""),
      payload: { timezone: "Europe/London", weeklyRule: WEEKDAY_RULE },
    });
    expectProblemJson(write, { status: 401, slug: "session-invalid" });
    expectGeneratedProblemResponse(write, {
      path: "/v1/scheduling/availability-patterns",
      method: "post",
      status: 401,
    });
  });

  it("403 (missing capability) is documented problem+json and names the capability", async () => {
    const write = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-exceptions",
      headers: await stateHeaders(readOnly.cookie),
      payload: { startsAt: "2026-09-07T10:00:00Z", endsAt: "2026-09-07T12:00:00Z" },
    });
    expectProblemJson(write, { status: 403, slug: "forbidden" });
    expectGeneratedProblemResponse(write, {
      path: "/v1/scheduling/availability-exceptions",
      method: "post",
      status: 403,
    });
    expect(write.json<Record<string, unknown>>()["requiredCapability"]).toBe(SCHEDULING_MANAGE);
  });

  it("422 (domain invariant) is documented problem+json with a field path", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-patterns",
      headers: await stateHeaders(manager.cookie),
      payload: { timezone: "Not/AZone", weeklyRule: WEEKDAY_RULE },
    });
    expectProblemJson(res, { status: 422, slug: "validation" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/scheduling/availability-patterns",
      method: "post",
      status: 422,
    });
    expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("timezone");
  });

  it("422 (expansion horizon) on resolve is documented problem+json", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability/resolve",
      headers: await stateHeaders(manager.cookie),
      payload: { from: "2026-01-01", to: "2027-02-06" },
    });
    expectProblemJson(res, { status: 422, slug: "validation" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/scheduling/availability/resolve",
      method: "post",
      status: 422,
    });
  });

  it("400 (schema-level validation) is documented problem+json", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-patterns",
      headers: await stateHeaders(manager.cookie),
      payload: { timezone: "Europe/London", weeklyRule: WEEKDAY_RULE, unexpected: true },
    });
    expectProblemJson(res, { status: 400, slug: "validation" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/scheduling/availability-patterns",
      method: "post",
      status: 400,
    });
  });

  it("leaks no persistence detail in any Scheduling failure body", async () => {
    const responses = [
      await app.inject({
        method: "POST",
        url: "/v1/scheduling/availability-patterns",
        headers: await stateHeaders(manager.cookie),
        payload: { timezone: "Not/AZone", weeklyRule: WEEKDAY_RULE },
      }),
      await app.inject({
        method: "POST",
        url: "/v1/scheduling/availability-exceptions",
        headers: await stateHeaders(manager.cookie),
        payload: { startsAt: "2026-09-07T12:00:00Z", endsAt: "2026-09-07T10:00:00Z" },
      }),
      await app.inject({
        method: "POST",
        url: "/v1/scheduling/availability/resolve",
        headers: await stateHeaders(manager.cookie),
        payload: { from: "2026-01-01", to: "2027-02-06" },
      }),
    ];

    for (const res of responses) {
      const raw = res.payload.toLowerCase();
      for (const leak of [
        "availability_patterns",
        "availability_exceptions",
        "workspace_id",
        "select ",
        "insert ",
        "daterange",
        "sqlstate",
        "pg_advisory",
      ]) {
        expect(raw, leak).not.toContain(leak);
      }
    }
  });
});
