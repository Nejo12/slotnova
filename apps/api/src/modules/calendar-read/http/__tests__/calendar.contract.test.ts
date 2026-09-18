/**
 * Contract tests for `GET /v1/calendar` (PR-09, issue #81,
 * `contracts/calendar.contract.md`), mirroring
 * `booking/http/__tests__/booking.contract.test.ts`:
 *
 * 1. the success body is parsed with the SAME Zod schema object
 *    `@ZodResponse` published to the OpenAPI document — not a hand-written
 *    expectation of it;
 * 2. every documented failure is asserted to be valid `problem+json` AND to
 *    match what the committed generated document declares for that exact
 *    path/method/status;
 * 3. the generated document is asserted to expose EXACTLY one Calendar
 *    operation — one GET, no writes, no sub-resources — and no `resourceId`,
 *    `locationId`, `staffId` or `clientId` parameter anywhere on it;
 * 4. the authorization boundary is proved for both required capabilities.
 *
 * `contracts:check` separately proves the committed document matches what
 * `openapi:generate` produces from current source, so asserting against the
 * committed artifact here is asserting against the real generated contract.
 *
 * Capabilities are granted by writing them onto a membership's `permissions`
 * explicitly. This suite deliberately does NOT rely on — or establish — any
 * default membership-role mapping.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { LightMyRequestResponse } from "fastify";
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
import { BOOKING_READ } from "../../../booking/index.js";
import { SCHEDULING_READ } from "../../../scheduling/index.js";
import { calendarResponseSchema } from "../calendar.schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "../../../../../openapi/openapi.json");

interface OpenApiDocument {
  paths: Record<string, Record<string, { parameters?: { name: string }[] }>>;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);

const FROM = "2026-09-01T00:00:00Z";
const TO = "2026-09-02T00:00:00Z";

describe("/v1/calendar contract", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;
  let document: OpenApiDocument;

  /** Holds both required capabilities. */
  let full: string;
  /** Holds `booking:read` only. */
  let bookingOnly: string;
  /** Holds `scheduling:read` only. */
  let schedulingOnly: string;
  /** A valid session with no active workspace selected. */
  let noWorkspace: string;

  let uniqueCounter = 0;
  const unique = (): string => `${Date.now()}-${(uniqueCounter += 1)}`;

  async function seedSession(
    permissions: readonly string[],
    withWorkspace = true,
  ): Promise<string> {
    const suffix = unique();
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Cal contract ${suffix}`, `cal-contract-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Cal Contract', 'active') RETURNING id`,
      [`cal-contract-${suffix}@example.test`],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status, permissions)
       VALUES ($1, $2, 'admin', 'active', $3)`,
      [workspace.rows[0]!.id, user.rows[0]!.id, [...permissions]],
    );
    const issued = await sessions.issue({
      userId: user.rows[0]!.id as UserId,
      activeWorkspaceId: withWorkspace ? (workspace.rows[0]!.id as WorkspaceId) : null,
    });
    return `${SESSION_COOKIE}=${issued.rawToken}`;
  }

  function read(cookie: string | null, from = FROM, to = TO): Promise<LightMyRequestResponse> {
    return app.inject({
      method: "GET",
      url: `/v1/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ...(cookie === null ? {} : { headers: { cookie } }),
    });
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

    document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiDocument;

    full = await seedSession([BOOKING_READ, SCHEDULING_READ]);
    bookingOnly = await seedSession([BOOKING_READ]);
    schedulingOnly = await seedSession([SCHEDULING_READ]);
    noWorkspace = await seedSession([BOOKING_READ, SCHEDULING_READ], false);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  describe("generated document", () => {
    it("exposes exactly one Calendar operation: GET /v1/calendar", () => {
      const calendarPaths = Object.keys(document.paths).filter((path) =>
        path.startsWith("/v1/calendar"),
      );
      expect(calendarPaths).toEqual(["/v1/calendar"]);
      expect(Object.keys(document.paths["/v1/calendar"]!)).toEqual(["get"]);
    });

    it("declares only `from` and `to` — no resource/location/staff/client dimension", () => {
      const names = (document.paths["/v1/calendar"]!["get"]!.parameters ?? [])
        .map((parameter) => parameter.name)
        .sort();
      expect(names).toEqual(["from", "to"]);
    });

    it("declares no Calendar-owned schema carrying client or customer data", () => {
      const serialized = JSON.stringify(document.paths["/v1/calendar"]);
      expect(serialized).not.toMatch(/resourceId|locationId|staffId|clientId|customer/i);
    });
  });

  describe("success", () => {
    it("200s with a body matching the published response schema", async () => {
      const response = await read(full);
      expect(response.statusCode).toBe(200);
      expect(() => calendarResponseSchema.parse(response.json())).not.toThrow();
    });
  });

  describe("documented failures", () => {
    it("401 session-invalid with no session", async () => {
      const response = await read(null);
      expectProblemJson(response, { status: 401, slug: "session-invalid" });
      expectGeneratedProblemResponse(response, {
        path: "/v1/calendar",
        method: "get",
        status: 401,
      });
    });

    it("403 forbidden holding only booking:read", async () => {
      const response = await read(bookingOnly);
      expectProblemJson(response, { status: 403, slug: "forbidden" });
      expectGeneratedProblemResponse(response, {
        path: "/v1/calendar",
        method: "get",
        status: 403,
      });
    });

    it("403 forbidden holding only scheduling:read", async () => {
      const response = await read(schedulingOnly);
      expectProblemJson(response, { status: 403, slug: "forbidden" });
    });

    it("403 forbidden with no active workspace", async () => {
      const response = await read(noWorkspace);
      expectProblemJson(response, { status: 403, slug: "forbidden" });
    });

    it("422 validation for a window beyond the expansion horizon", async () => {
      const response = await read(full, "2026-01-01T00:00:00Z", "2028-01-01T00:00:00Z");
      expectProblemJson(response, { status: 422, slug: "validation" });
      expectGeneratedProblemResponse(response, {
        path: "/v1/calendar",
        method: "get",
        status: 422,
      });
    });

    it("400 validation for a malformed window", async () => {
      const response = await read(full, "yesterday", TO);
      expectProblemJson(response, { status: 400, slug: "validation" });
      expectGeneratedProblemResponse(response, {
        path: "/v1/calendar",
        method: "get",
        status: 400,
      });
    });
  });
});
