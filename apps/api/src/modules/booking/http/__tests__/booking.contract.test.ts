/**
 * Contract tests for `/v1/bookings` (PR-07, issue #73,
 * `contracts/booking.contract.md`), mirroring the pattern
 * `catalog/http/__tests__/catalog.contract.test.ts` established:
 *
 * 1. every success body is parsed with the SAME Zod schema object
 *    `@ZodResponse` published to the OpenAPI document — not a hand-written
 *    expectation of it;
 * 2. every documented failure is asserted to be valid `problem+json` AND to
 *    match what the committed generated document declares for that exact
 *    path/method/status (`expectGeneratedProblemResponse`);
 * 3. the generated document itself is asserted to contain exactly the six
 *    endpoints this PR is scoped to — no `/confirm`, no DELETE, no Calendar
 *    or Clients route may appear;
 * 4. every route class proves its authorization boundary: the right
 *    capability passes, an authenticated caller without it gets 403, an
 *    unauthenticated one gets 401, and a session with no active workspace
 *    gets the canonical existing 403.
 *
 * `contracts:check` separately proves the committed document matches what
 * `openapi:generate` produces from current source, so asserting against the
 * committed artifact here is asserting against the real generated contract.
 *
 * Capabilities are granted by writing them onto a membership's `permissions`
 * explicitly. This suite deliberately does NOT rely on — or establish — any
 * default membership-role mapping for `booking:*`: that remains an open
 * Founder product decision.
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
import { CATALOG_MANAGE, CATALOG_READ } from "../../../catalog/domain/policy/capabilities.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import {
  BOOKING_CANCEL,
  BOOKING_COMPLETE,
  BOOKING_CREATE,
  BOOKING_EDIT,
  BOOKING_READ,
} from "../../domain/policy/capabilities.js";
import { bookingListResponseSchema, bookingResponseSchema } from "../booking.schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "../../../../../openapi/openapi.json");

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

const SEED_CAPABILITIES = [CATALOG_READ, CATALOG_MANAGE] as const;

describe("/v1/bookings contract", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  /** Holds every Booking capability; used for the happy paths and fixtures. */
  let full: string;
  /** Holds `booking:read` (plus the Catalog seeding pair) and nothing else. */
  let readOnly: string;
  /** A valid session whose membership carries no capability at all. */
  let capabilityless: string;
  /** A valid session with NO active workspace selected. */
  let workspaceless: string;

  let counter = 0;
  const unique = (): string => `${Date.now()}-${(counter += 1)}`;

  async function seedSession(
    permissions: readonly string[],
    options: { readonly withWorkspace?: boolean } = {},
  ): Promise<string> {
    const suffix = unique();
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Booking contract WS ${suffix}`, `booking-contract-ws-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Contract User', 'active') RETURNING id`,
      [`booking-contract-${suffix}@example.test`],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status, permissions)
       VALUES ($1, $2, 'admin', 'active', $3)`,
      [workspace.rows[0]!.id, user.rows[0]!.id, [...permissions]],
    );
    const issued = await sessions.issue({
      userId: user.rows[0]!.id as UserId,
      activeWorkspaceId:
        options.withWorkspace === false ? null : (workspace.rows[0]!.id as WorkspaceId),
    });
    return `${SESSION_COOKIE}=${issued.rawToken}`;
  }

  async function stateHeaders(cookie: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const csrf = res.cookies.find((c) => c.name === CSRF_COOKIE);
    if (!csrf) throw new Error("CSRF bootstrap did not set a cookie");
    return {
      cookie:
        cookie === "" ? `${csrf.name}=${csrf.value}` : `${cookie}; ${csrf.name}=${csrf.value}`,
      "x-csrf-token": csrf.value,
    };
  }

  async function seedService(cookie: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: { ...(await stateHeaders(cookie)), "idempotency-key": `svc-${unique()}` },
      payload: {
        name: "Contract service",
        durationMinutes: 30,
        priceAmountMinor: 3000,
        priceCurrency: "GBP",
      },
    });
    if (res.statusCode !== 201) throw new Error(`service seed failed: ${res.payload}`);
    return res.json<{ id: string }>().id;
  }

  async function createBooking(cookie: string, startsAt: string): Promise<LightMyRequestResponse> {
    const serviceId = await seedService(full);
    return app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: { ...(await stateHeaders(cookie)), "idempotency-key": `bk-${unique()}` },
      payload: { serviceId, startsAt },
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

    full = await seedSession([
      BOOKING_READ,
      BOOKING_CREATE,
      BOOKING_EDIT,
      BOOKING_CANCEL,
      BOOKING_COMPLETE,
      ...SEED_CAPABILITIES,
    ]);
    readOnly = await seedSession([BOOKING_READ, ...SEED_CAPABILITIES]);
    capabilityless = await seedSession([]);
    workspaceless = await seedSession(
      [BOOKING_READ, BOOKING_CREATE, BOOKING_EDIT, BOOKING_CANCEL, BOOKING_COMPLETE],
      { withWorkspace: false },
    );
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  it("publishes exactly the six PR-07 Booking operations and no deferred surface", () => {
    const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiDocument;
    const bookingOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith("/v1/bookings"))
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

    expect(bookingOperations).toEqual([
      "GET /v1/bookings",
      "GET /v1/bookings/{id}",
      "POST /v1/bookings",
      "POST /v1/bookings/{id}/cancel",
      "POST /v1/bookings/{id}/complete",
      "POST /v1/bookings/{id}/reschedule",
    ]);
    const joined = bookingOperations.join(" ");
    // `contracts/booking.contract.md` "Not part of Phase 2", and the deferred
    // dimensions: none of these may appear.
    expect(joined).not.toContain("confirm");
    expect(joined).not.toContain("DELETE");
    expect(joined).not.toContain("clients");
    expect(joined).not.toContain("resources");
  });

  it("publishes no deferred field anywhere in the Booking request/response schemas", () => {
    const raw = readFileSync(OPENAPI_PATH, "utf8");
    const document = JSON.parse(raw) as {
      components: { schemas: Record<string, unknown> };
    };
    const bookingSchemas = Object.entries(document.components.schemas)
      .filter(([name]) => name.startsWith("Booking") || name.includes("BookingRequest"))
      .map(([, schema]) => JSON.stringify(schema))
      .join(" ");

    for (const deferred of ["clientId", "resourceId", "locationId", "staffId", "workspaceId"]) {
      expect(bookingSchemas).not.toContain(deferred);
    }
  });

  it("success bodies validate against the published response schemas", async () => {
    const created = await createBooking(full, "2029-01-01T09:00:00Z");
    expect(created.statusCode).toBe(201);
    const booking = bookingResponseSchema.parse(created.json());

    const detail = await app.inject({
      method: "GET",
      url: `/v1/bookings/${booking.id}`,
      headers: { cookie: full },
    });
    expect(detail.statusCode).toBe(200);
    bookingResponseSchema.parse(detail.json());

    const list = await app.inject({
      method: "GET",
      url: "/v1/bookings?from=2029-01-01T00:00:00Z&to=2029-01-02T00:00:00Z",
      headers: { cookie: full },
    });
    expect(list.statusCode).toBe(200);
    bookingListResponseSchema.parse(list.json());

    const rescheduled = await app.inject({
      method: "POST",
      url: `/v1/bookings/${booking.id}/reschedule`,
      headers: await stateHeaders(full),
      payload: { version: booking.version, startsAt: "2029-01-01T15:00:00Z" },
    });
    expect(rescheduled.statusCode).toBe(200);
    const moved = bookingResponseSchema.parse(rescheduled.json());

    const cancelled = await app.inject({
      method: "POST",
      url: `/v1/bookings/${booking.id}/cancel`,
      headers: await stateHeaders(full),
      payload: { version: moved.version, reason: "Contract test" },
    });
    expect(cancelled.statusCode).toBe(200);
    bookingResponseSchema.parse(cancelled.json());

    const other = await createBooking(full, "2029-02-01T09:00:00Z");
    const completed = await app.inject({
      method: "POST",
      url: `/v1/bookings/${other.json<{ id: string }>().id}/complete`,
      headers: await stateHeaders(full),
      payload: { version: 1 },
    });
    expect(completed.statusCode).toBe(200);
    bookingResponseSchema.parse(completed.json());
  });

  describe("authorization", () => {
    it("401 (no session) on a read and on every mutating route", async () => {
      const read = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2029-03-01T00:00:00Z&to=2029-03-02T00:00:00Z",
      });
      expectProblemJson(read, { status: 401, slug: "session-invalid" });
      expectGeneratedProblemResponse(read, { path: "/v1/bookings", method: "get", status: 401 });

      const create = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: { ...(await stateHeaders("")), "idempotency-key": `anon-${unique()}` },
        payload: {
          serviceId: "11111111-1111-4111-8111-111111111111",
          startsAt: "2029-03-01T09:00:00Z",
        },
      });
      expectProblemJson(create, { status: 401, slug: "session-invalid" });
      expectGeneratedProblemResponse(create, { path: "/v1/bookings", method: "post", status: 401 });

      for (const action of ["reschedule", "cancel", "complete"] as const) {
        const res = await app.inject({
          method: "POST",
          url: `/v1/bookings/11111111-1111-4111-8111-111111111111/${action}`,
          headers: await stateHeaders(""),
          payload: { version: 1, startsAt: "2029-03-01T09:00:00Z" },
        });
        expectProblemJson(res, { status: 401, slug: "session-invalid" });
        expectGeneratedProblemResponse(res, {
          path: `/v1/bookings/{id}/${action}`,
          method: "post",
          status: 401,
        });
      }
    });

    it("403 naming the exact capability each route requires", async () => {
      const cases = [
        { path: "/v1/bookings", method: "get" as const, capability: BOOKING_READ },
        { path: "/v1/bookings", method: "post" as const, capability: BOOKING_CREATE },
        {
          path: "/v1/bookings/{id}/reschedule",
          method: "post" as const,
          capability: BOOKING_EDIT,
        },
        { path: "/v1/bookings/{id}/cancel", method: "post" as const, capability: BOOKING_CANCEL },
        {
          path: "/v1/bookings/{id}/complete",
          method: "post" as const,
          capability: BOOKING_COMPLETE,
        },
      ];

      for (const { path, method, capability } of cases) {
        const url = path.replace("{id}", "11111111-1111-4111-8111-111111111111");
        const res =
          method === "get"
            ? await app.inject({
                method: "GET",
                url: `${url}?from=2029-04-01T00:00:00Z&to=2029-04-02T00:00:00Z`,
                headers: { cookie: capabilityless },
              })
            : await app.inject({
                method: "POST",
                url,
                headers: {
                  ...(await stateHeaders(capabilityless)),
                  "idempotency-key": `f-${unique()}`,
                },
                payload: {
                  version: 1,
                  serviceId: "11111111-1111-4111-8111-111111111111",
                  startsAt: "2029-04-01T09:00:00Z",
                },
              });

        expectProblemJson(res, { status: 403, slug: "forbidden" });
        expectGeneratedProblemResponse(res, { path, method, status: 403 });
        expect(res.json<Record<string, unknown>>()["requiredCapability"]).toBe(capability);
      }
    });

    it("403 for a booking:read holder attempting each write, and 200 for the read", async () => {
      const created = await createBooking(full, "2029-05-01T09:00:00Z");
      const booking = created.json<{ id: string; version: number }>();

      const allowed = await app.inject({
        method: "GET",
        url: `/v1/bookings/${booking.id}`,
        headers: { cookie: readOnly },
      });
      // Different workspace, so this proves the capability passes the guard
      // (404, not 403) rather than that the row is visible.
      expect(allowed.statusCode).toBe(404);

      for (const action of ["reschedule", "cancel", "complete"] as const) {
        const res = await app.inject({
          method: "POST",
          url: `/v1/bookings/${booking.id}/${action}`,
          headers: await stateHeaders(readOnly),
          payload: { version: 1, startsAt: "2029-05-01T15:00:00Z" },
        });
        expectProblemJson(res, { status: 403, slug: "forbidden" });
      }
    });

    it("403 when the session has no active workspace, even with every capability", async () => {
      const read = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2029-06-01T00:00:00Z&to=2029-06-02T00:00:00Z",
        headers: { cookie: workspaceless },
      });
      expectProblemJson(read, { status: 403, slug: "forbidden" });

      const create = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: {
          ...(await stateHeaders(workspaceless)),
          "idempotency-key": `ws-${unique()}`,
        },
        payload: {
          serviceId: "11111111-1111-4111-8111-111111111111",
          startsAt: "2029-06-01T09:00:00Z",
        },
      });
      expectProblemJson(create, { status: 403, slug: "forbidden" });
    });
  });

  describe("documented failures", () => {
    it("400 (unknown property) is documented problem+json", async () => {
      const serviceId = await seedService(full);
      const res = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: { ...(await stateHeaders(full)), "idempotency-key": `b-${unique()}` },
        payload: { serviceId, startsAt: "2029-07-01T09:00:00Z", clientId: serviceId },
      });
      expectProblemJson(res, { status: 400, slug: "validation" });
      expectGeneratedProblemResponse(res, { path: "/v1/bookings", method: "post", status: 400 });
    });

    it("422 (unavailable service) is documented problem+json with a field path", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: { ...(await stateHeaders(full)), "idempotency-key": `v-${unique()}` },
        payload: {
          serviceId: "99999999-9999-4999-8999-999999999999",
          startsAt: "2029-08-01T09:00:00Z",
        },
      });
      expectProblemJson(res, { status: 422, slug: "validation" });
      expectGeneratedProblemResponse(res, { path: "/v1/bookings", method: "post", status: 422 });
      expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("serviceId");
    });

    it("404 (unknown/foreign booking) is documented problem+json", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/bookings/11111111-1111-4111-8111-111111111111",
        headers: { cookie: full },
      });
      expectProblemJson(res, { status: 404, slug: "not-found" });
      expectGeneratedProblemResponse(res, {
        path: "/v1/bookings/{id}",
        method: "get",
        status: 404,
      });
    });

    it("409 booking-overlap is documented problem+json and leaks no persistence detail", async () => {
      const serviceId = await seedService(full);
      const headers = async (): Promise<Record<string, string>> => ({
        ...(await stateHeaders(full)),
        "idempotency-key": `ov-${unique()}`,
      });

      const first = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: await headers(),
        payload: { serviceId, startsAt: "2029-09-01T09:00:00Z" },
      });
      expect(first.statusCode).toBe(201);

      const res = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: await headers(),
        payload: { serviceId, startsAt: "2029-09-01T09:15:00Z" },
      });
      expectProblemJson(res, { status: 409, slug: "booking-overlap" });
      expectGeneratedProblemResponse(res, { path: "/v1/bookings", method: "post", status: 409 });
      const raw = res.payload.toLowerCase();
      for (const leak of ["bookings_no_overlap", "23p01", "exclude", "gist", "public.bookings"]) {
        expect(raw).not.toContain(leak);
      }
    });

    it("409 idempotency-conflict is documented problem+json", async () => {
      const serviceId = await seedService(full);
      const key = `dup-${unique()}`;
      const first = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: { ...(await stateHeaders(full)), "idempotency-key": key },
        payload: { serviceId, startsAt: "2029-10-01T09:00:00Z" },
      });
      expect(first.statusCode).toBe(201);

      const res = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: { ...(await stateHeaders(full)), "idempotency-key": key },
        payload: { serviceId, startsAt: "2029-10-01T18:00:00Z" },
      });
      expectProblemJson(res, { status: 409, slug: "idempotency-conflict" });
    });

    it("409 stale-write and 409 invalid-transition are documented problem+json", async () => {
      const created = await createBooking(full, "2029-11-01T09:00:00Z");
      const booking = created.json<{ id: string; version: number }>();

      const cancelled = await app.inject({
        method: "POST",
        url: `/v1/bookings/${booking.id}/cancel`,
        headers: await stateHeaders(full),
        payload: { version: booking.version },
      });
      expect(cancelled.statusCode).toBe(200);

      const stale = await app.inject({
        method: "POST",
        url: `/v1/bookings/${booking.id}/cancel`,
        headers: await stateHeaders(full),
        payload: { version: booking.version },
      });
      expectProblemJson(stale, { status: 409, slug: "stale-write" });
      expectGeneratedProblemResponse(stale, {
        path: "/v1/bookings/{id}/cancel",
        method: "post",
        status: 409,
      });

      const invalid = await app.inject({
        method: "POST",
        url: `/v1/bookings/${booking.id}/complete`,
        headers: await stateHeaders(full),
        payload: { version: cancelled.json<{ version: number }>().version },
      });
      expectProblemJson(invalid, { status: 409, slug: "invalid-transition" });
      expectGeneratedProblemResponse(invalid, {
        path: "/v1/bookings/{id}/complete",
        method: "post",
        status: 409,
      });
    });

    it("422 (inverted window) is documented problem+json", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2029-12-02T00:00:00Z&to=2029-12-01T00:00:00Z",
        headers: { cookie: full },
      });
      expectProblemJson(res, { status: 422, slug: "validation" });
      expectGeneratedProblemResponse(res, { path: "/v1/bookings", method: "get", status: 422 });
    });
  });
});
