/**
 * `/v1/bookings` against real PostgreSQL through the full Nest+Fastify app
 * boot (PR-07, issue #73, `contracts/booking.contract.md`) — same harness
 * pattern as `catalog/http/__tests__/catalog-api.int.test.ts`.
 *
 * Real PostgreSQL is mandatory here, not a convenience: RLS tenant isolation,
 * the `bookings_no_overlap` exclusion constraint, the generated
 * `blocking_range` column and the `idempotent_requests` unique index are all
 * database behavior, and a mocked repository would prove none of them
 * (AGENTS.md testing expectations).
 *
 * The idempotency assertions deliberately check `bookings` ROW COUNTS, not
 * only that two HTTP responses matched: equal responses are exactly what a
 * broken implementation that created two rows and returned the second would
 * also produce. The no-op assertions check `version`/`updated_at` in the
 * database for the same reason.
 *
 * Services are seeded through the real `POST /v1/catalog/services` endpoint
 * rather than by inserting into `public.services` directly, so the Catalog
 * Service snapshot seam under test is exercised against rows Catalog itself
 * wrote.
 */
import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
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

interface Actor {
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionCookie: string;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

/**
 * Every Booking capability plus the two Catalog ones the test fixtures need
 * to seed a Service. Explicit membership permissions, never a role mapping:
 * which roles receive `booking:*` by default is an open Founder product
 * decision this PR deliberately does not make.
 */
const FULL_BOOKING_PERMISSIONS = [
  BOOKING_READ,
  BOOKING_CREATE,
  BOOKING_EDIT,
  BOOKING_CANCEL,
  BOOKING_COMPLETE,
  CATALOG_READ,
  CATALOG_MANAGE,
] as const;

describe("/v1/bookings (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  let operator: Actor;
  let otherOperator: Actor;

  let uniqueCounter = 0;
  const unique = (): string => `${Date.now()}-${(uniqueCounter += 1)}`;

  async function seedActor(permissions: readonly string[]): Promise<Actor> {
    const suffix = unique();
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Booking WS ${suffix}`, `booking-ws-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Booking User', 'active') RETURNING id`,
      [`booking-${suffix}@example.test`],
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
      userId: user.rows[0]!.id,
      sessionCookie: `${SESSION_COOKIE}=${issued.rawToken}`,
    };
  }

  /** Headers for a state-changing request: session + the double-submit CSRF pair. */
  async function stateHeaders(actor: Actor): Promise<Record<string, string>> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const cookie = res.cookies.find((c) => c.name === CSRF_COOKIE);
    if (!cookie) throw new Error("CSRF bootstrap did not set a cookie");
    return {
      cookie: `${actor.sessionCookie}; ${cookie.name}=${cookie.value}`,
      "x-csrf-token": cookie.value,
    };
  }

  async function seedService(
    actor: Actor,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: { ...(await stateHeaders(actor)), "idempotency-key": `svc-${unique()}` },
      payload: {
        name: "Cut & finish",
        durationMinutes: 45,
        preBufferMinutes: 5,
        postBufferMinutes: 10,
        priceAmountMinor: 4500,
        priceCurrency: "GBP",
        ...overrides,
      },
    });
    if (res.statusCode !== 201) throw new Error(`service seed failed: ${res.payload}`);
    return res.json<{ id: string }>().id;
  }

  async function deactivateService(actor: Actor, serviceId: string): Promise<void> {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/services/${serviceId}`,
      headers: await stateHeaders(actor),
      payload: { active: false },
    });
    if (res.statusCode !== 200) throw new Error(`deactivate failed: ${res.payload}`);
  }

  async function createBooking(
    actor: Actor,
    body: Record<string, unknown>,
    idempotencyKey = `bk-${unique()}`,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: { ...(await stateHeaders(actor)), "idempotency-key": idempotencyKey },
      payload: body,
    });
  }

  async function command(
    actor: Actor,
    bookingId: string,
    action: "reschedule" | "cancel" | "complete",
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/${action}`,
      headers: await stateHeaders(actor),
      payload: body,
    });
  }

  async function bookingCount(workspaceId: string): Promise<number> {
    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings WHERE workspace_id = $1`,
      [workspaceId],
    );
    return Number(rows[0]!.count);
  }

  async function storedBooking(id: string): Promise<{
    version: number;
    updated_at: string;
    status: string;
    cancelled_reason: string | null;
  }> {
    const { rows } = await admin.query<{
      version: number;
      updated_at: string;
      status: string;
      cancelled_reason: string | null;
    }>(
      `SELECT version, to_json(updated_at) #>> '{}' AS updated_at, status, cancelled_reason
         FROM public.bookings WHERE id = $1`,
      [id],
    );
    return rows[0]!;
  }

  /** Creates one confirmed booking and returns its response body. */
  async function givenConfirmedBooking(
    actor: Actor,
    startsAt: string,
  ): Promise<Record<string, unknown>> {
    const serviceId = await seedService(actor);
    const res = await createBooking(actor, { serviceId, startsAt });
    expect(res.statusCode).toBe(201);
    return res.json<Record<string, unknown>>();
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

    operator = await seedActor(FULL_BOOKING_PERMISSIONS);
    otherOperator = await seedActor(FULL_BOOKING_PERMISSIONS);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  describe("POST /v1/bookings", () => {
    it("creates a confirmed booking at version 1 and snapshots the Service server-side", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);

      const res = await createBooking(actor, { serviceId, startsAt: "2026-09-01T09:00:00Z" });

      expect(res.statusCode).toBe(201);
      const body = res.json<Record<string, unknown>>();
      expect(body).toMatchObject({
        serviceId,
        startsAt: "2026-09-01T09:00:00Z",
        // Never supplied by the caller — read from the current Service.
        serviceDurationMinutes: 45,
        preBufferMinutes: 5,
        postBufferMinutes: 10,
        status: "confirmed",
        version: 1,
        cancelledReason: null,
      });
      // `[startsAt - pre, startsAt + duration + post)`, as the database's
      // generated column computed it.
      expect(body["blockingRange"]).toEqual({
        start: "2026-09-01T08:55:00Z",
        end: "2026-09-01T09:55:00Z",
      });
      expect(body).not.toHaveProperty("workspaceId");
    });

    it("ignores nothing: a caller cannot influence the snapshot, because the schema rejects it", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);

      const res = await createBooking(actor, {
        serviceId,
        startsAt: "2026-09-01T09:00:00Z",
        serviceDurationMinutes: 5,
      });

      expect(res.statusCode).toBe(400);
      expect(await bookingCount(actor.workspaceId)).toBe(0);
    });

    it.each(["clientId", "resourceId", "locationId", "staffId"])(
      "rejects a %s field rather than silently accepting and ignoring it",
      async (field) => {
        const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
        const serviceId = await seedService(actor);

        const res = await createBooking(actor, {
          serviceId,
          startsAt: "2026-09-01T09:00:00Z",
          [field]: "11111111-1111-4111-8111-111111111111",
        });

        expect(res.statusCode).toBe(400);
        expect(await bookingCount(actor.workspaceId)).toBe(0);
      },
    );

    it("rejects a malformed startsAt", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);

      const res = await createBooking(actor, { serviceId, startsAt: "not-an-instant" });

      expect(res.statusCode).toBe(400);
      expect(await bookingCount(actor.workspaceId)).toBe(0);
    });

    it("requires an Idempotency-Key header", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);

      const res = await app.inject({
        method: "POST",
        url: "/v1/bookings",
        headers: await stateHeaders(actor),
        payload: { serviceId, startsAt: "2026-09-01T09:00:00Z" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("Idempotency-Key");
      expect(await bookingCount(actor.workspaceId)).toBe(0);
    });

    it("refuses an inactive Service with a 422 that names no id", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      await deactivateService(actor, serviceId);

      const res = await createBooking(actor, { serviceId, startsAt: "2026-09-01T09:00:00Z" });

      expect(res.statusCode).toBe(422);
      const body = res.json<{ errors: { path: string; message: string }[] }>();
      expect(body.errors[0]!.path).toBe("serviceId");
      expect(res.payload).not.toContain(serviceId);
      expect(await bookingCount(actor.workspaceId)).toBe(0);
    });

    it("refuses an unknown Service without leaking whether it exists", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const missing = "33333333-3333-4333-8333-333333333333";

      const res = await createBooking(actor, {
        serviceId: missing,
        startsAt: "2026-09-01T09:00:00Z",
      });

      expect(res.statusCode).toBe(422);
      expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("serviceId");
      expect(await bookingCount(actor.workspaceId)).toBe(0);
    });

    it("makes another workspace's Service indistinguishable from a nonexistent one", async () => {
      const foreignServiceId = await seedService(otherOperator);

      const mine = await createBooking(operator, {
        serviceId: "44444444-4444-4444-8444-444444444444",
        startsAt: "2026-09-01T09:00:00Z",
      });
      const theirs = await createBooking(operator, {
        serviceId: foreignServiceId,
        startsAt: "2026-09-01T09:00:00Z",
      });

      expect(theirs.statusCode).toBe(mine.statusCode);
      expect(theirs.json()).toMatchObject({
        type: mine.json<{ type: string }>().type,
        errors: mine.json<{ errors: unknown }>().errors,
      });
      expect(theirs.payload).not.toContain(foreignServiceId);
    });

    it("replays an identical retry: same 201 body, exactly one row", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      const key = `replay-${unique()}`;
      const payload = { serviceId, startsAt: "2026-09-01T09:00:00Z" };

      const first = await createBooking(actor, payload, key);
      const second = await createBooking(actor, payload, key);

      expect(first.statusCode).toBe(201);
      // A replay must NOT hit `bookings_no_overlap` against the booking it
      // already created — the durable record returns before any INSERT.
      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(await bookingCount(actor.workspaceId)).toBe(1);
    });

    it("replays across an equivalent-but-differently-written instant", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      const key = `offset-${unique()}`;

      const first = await createBooking(
        actor,
        { serviceId, startsAt: "2026-09-01T09:00:00Z" },
        key,
      );
      const second = await createBooking(
        actor,
        { serviceId, startsAt: "2026-09-01T10:00:00+01:00" },
        key,
      );

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(await bookingCount(actor.workspaceId)).toBe(1);
    });

    it("conflicts when the same key carries a materially different request, creating nothing", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      const key = `conflict-${unique()}`;

      const first = await createBooking(
        actor,
        { serviceId, startsAt: "2026-09-01T09:00:00Z" },
        key,
      );
      const second = await createBooking(
        actor,
        { serviceId, startsAt: "2026-09-01T14:00:00Z" },
        key,
      );

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(second.json<{ type: string }>().type).toContain("/problems/idempotency-conflict");
      expect(await bookingCount(actor.workspaceId)).toBe(1);
      const raw = second.payload.toLowerCase();
      for (const leak of ["idempotent_requests", "insert", "select", "sqlstate", "fingerprint"]) {
        expect(raw).not.toContain(leak);
      }
    });

    it("scopes the same key per workspace: two independent bookings", async () => {
      const key = `shared-${unique()}`;
      const mineService = await seedService(operator);
      const theirService = await seedService(otherOperator);

      const mine = await createBooking(
        operator,
        { serviceId: mineService, startsAt: "2026-10-01T09:00:00Z" },
        key,
      );
      const theirs = await createBooking(
        otherOperator,
        { serviceId: theirService, startsAt: "2026-10-01T09:00:00Z" },
        key,
      );

      expect(mine.statusCode).toBe(201);
      expect(theirs.statusCode).toBe(201);
      expect(mine.json<{ id: string }>().id).not.toBe(theirs.json<{ id: string }>().id);
    });

    it("rejects an overlapping booking with 409 booking-overlap and no constraint detail", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);

      const first = await createBooking(actor, { serviceId, startsAt: "2026-09-01T09:00:00Z" });
      expect(first.statusCode).toBe(201);

      // 09:30 blocks [09:25, 10:25) — overlaps the first booking's
      // [08:55, 09:55).
      const second = await createBooking(actor, { serviceId, startsAt: "2026-09-01T09:30:00Z" });

      expect(second.statusCode).toBe(409);
      const body = second.json<{ type: string; detail: string }>();
      expect(body.type).toContain("/problems/booking-overlap");
      // The requested window — the caller's own — is stated so a client can
      // offer "try another slot". Nothing about the conflicting booking is.
      expect(body.detail).toContain("2026-09-01T09:25:00Z");
      expect(body.detail).toContain("2026-09-01T10:25:00Z");
      expect(body.detail).not.toContain("08:55");
      const raw = second.payload.toLowerCase();
      for (const leak of ["bookings_no_overlap", "23p01", "exclusion", "gist", "public.bookings"]) {
        expect(raw).not.toContain(leak);
      }
      expect(await bookingCount(actor.workspaceId)).toBe(1);
    });

    it("lets two workspaces book the same wall-clock time", async () => {
      const mineService = await seedService(operator);
      const theirService = await seedService(otherOperator);

      const mine = await createBooking(operator, {
        serviceId: mineService,
        startsAt: "2026-11-01T09:00:00Z",
      });
      const theirs = await createBooking(otherOperator, {
        serviceId: theirService,
        startsAt: "2026-11-01T09:00:00Z",
      });

      expect(mine.statusCode).toBe(201);
      expect(theirs.statusCode).toBe(201);
    });
  });

  describe("GET /v1/bookings", () => {
    it("returns the half-open window in deterministic order, scoped to the workspace", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      const foreignService = await seedService(otherOperator);

      const later = await createBooking(actor, { serviceId, startsAt: "2026-12-02T12:00:00Z" });
      const earlier = await createBooking(actor, { serviceId, startsAt: "2026-12-02T09:00:00Z" });
      const outside = await createBooking(actor, { serviceId, startsAt: "2026-12-03T09:00:00Z" });
      // Another workspace's booking at a time inside the window.
      await createBooking(otherOperator, {
        serviceId: foreignService,
        startsAt: "2026-12-02T10:00:00Z",
      });
      expect([later.statusCode, earlier.statusCode, outside.statusCode]).toEqual([201, 201, 201]);

      const res = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2026-12-02T00:00:00Z&to=2026-12-03T00:00:00Z",
        headers: { cookie: actor.sessionCookie },
      });

      expect(res.statusCode).toBe(200);
      const items = res.json<{ items: { id: string; startsAt: string }[] }>().items;
      expect(items.map((b) => b.startsAt)).toEqual([
        "2026-12-02T09:00:00Z",
        "2026-12-02T12:00:00Z",
      ]);
      // `to` is exclusive: the 2026-12-03T09:00 booking is out, and no other
      // workspace's booking is ever in.
      expect(items.map((b) => b.id)).not.toContain(outside.json<{ id: string }>().id);
    });

    it("includes a booking starting exactly at `from` and excludes one starting exactly at `to`", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      await createBooking(actor, { serviceId, startsAt: "2027-01-04T08:00:00Z" });
      await createBooking(actor, { serviceId, startsAt: "2027-01-04T12:00:00Z" });

      const res = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2027-01-04T08:00:00Z&to=2027-01-04T12:00:00Z",
        headers: { cookie: actor.sessionCookie },
      });

      expect(res.json<{ items: { startsAt: string }[] }>().items.map((b) => b.startsAt)).toEqual([
        "2027-01-04T08:00:00Z",
      ]);
    });

    it("filters by status", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      const keep = await createBooking(actor, { serviceId, startsAt: "2027-02-01T09:00:00Z" });
      const drop = await createBooking(actor, { serviceId, startsAt: "2027-02-01T13:00:00Z" });
      expect(keep.statusCode).toBe(201);
      const cancelled = drop.json<{ id: string; version: number }>();
      expect(
        (await command(actor, cancelled.id, "cancel", { version: cancelled.version })).statusCode,
      ).toBe(200);

      const window = "from=2027-02-01T00:00:00Z&to=2027-02-02T00:00:00Z";
      const confirmed = await app.inject({
        method: "GET",
        url: `/v1/bookings?${window}&status=confirmed`,
        headers: { cookie: actor.sessionCookie },
      });
      const cancelledOnly = await app.inject({
        method: "GET",
        url: `/v1/bookings?${window}&status=cancelled`,
        headers: { cookie: actor.sessionCookie },
      });

      expect(confirmed.json<{ items: { id: string }[] }>().items.map((b) => b.id)).toEqual([
        keep.json<{ id: string }>().id,
      ]);
      expect(cancelledOnly.json<{ items: { id: string }[] }>().items.map((b) => b.id)).toEqual([
        cancelled.id,
      ]);
    });

    it("rejects an inverted window with 422 and a malformed one with 400", async () => {
      const inverted = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2027-03-02T00:00:00Z&to=2027-03-01T00:00:00Z",
        headers: { cookie: operator.sessionCookie },
      });
      const malformed = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=yesterday&to=2027-03-01T00:00:00Z",
        headers: { cookie: operator.sessionCookie },
      });
      const unbounded = await app.inject({
        method: "GET",
        url: "/v1/bookings",
        headers: { cookie: operator.sessionCookie },
      });

      expect(inverted.statusCode).toBe(422);
      expect(malformed.statusCode).toBe(400);
      expect(unbounded.statusCode).toBe(400);
    });

    it("rejects a deferred filter parameter rather than ignoring it", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/bookings?from=2027-03-01T00:00:00Z&to=2027-03-02T00:00:00Z&resourceId=x",
        headers: { cookie: operator.sessionCookie },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /v1/bookings/:id", () => {
    it("returns the caller's own booking", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-04-01T09:00:00Z");

      const res = await app.inject({
        method: "GET",
        url: `/v1/bookings/${String(created["id"])}`,
        headers: { cookie: actor.sessionCookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(created);
    });

    it("answers 404 identically for a missing id and another workspace's booking", async () => {
      const theirs = await givenConfirmedBooking(otherOperator, "2027-05-01T09:00:00Z");

      const missing = await app.inject({
        method: "GET",
        url: "/v1/bookings/55555555-5555-4555-8555-555555555555",
        headers: { cookie: operator.sessionCookie },
      });
      const foreign = await app.inject({
        method: "GET",
        url: `/v1/bookings/${String(theirs["id"])}`,
        headers: { cookie: operator.sessionCookie },
      });

      expect(missing.statusCode).toBe(404);
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json()).toMatchObject({ type: missing.json<{ type: string }>().type });
      expect(foreign.payload).not.toContain(String(theirs["serviceId"]));
    });
  });

  describe("POST /v1/bookings/:id/reschedule", () => {
    it("moves the booking, bumps the version and preserves the original snapshot", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-06-01T09:00:00Z");
      // The Service changes AFTER creation — the booking must not notice.
      await app.inject({
        method: "PATCH",
        url: `/v1/catalog/services/${String(created["serviceId"])}`,
        headers: await stateHeaders(actor),
        payload: { durationMinutes: 90, preBufferMinutes: 30, postBufferMinutes: 30 },
      });

      const res = await command(actor, String(created["id"]), "reschedule", {
        version: created["version"],
        startsAt: "2027-06-01T15:00:00Z",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<Record<string, unknown>>();
      expect(body).toMatchObject({
        startsAt: "2027-06-01T15:00:00Z",
        serviceId: created["serviceId"],
        serviceDurationMinutes: 45,
        preBufferMinutes: 5,
        postBufferMinutes: 10,
        status: "confirmed",
        version: 2,
      });
      expect(body["blockingRange"]).toEqual({
        start: "2027-06-01T14:55:00Z",
        end: "2027-06-01T15:55:00Z",
      });
    });

    it("reports a stale version as 409 stale-write carrying the current version", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-07-01T09:00:00Z");
      expect(
        (
          await command(actor, String(created["id"]), "reschedule", {
            version: 1,
            startsAt: "2027-07-01T11:00:00Z",
          })
        ).statusCode,
      ).toBe(200);

      const res = await command(actor, String(created["id"]), "reschedule", {
        version: 1,
        startsAt: "2027-07-01T13:00:00Z",
      });

      expect(res.statusCode).toBe(409);
      const body = res.json<{ type: string; detail: string }>();
      expect(body.type).toContain("/problems/stale-write");
      expect(body.detail).toContain("2");
    });

    it("reports a new range that collides as 409 booking-overlap", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const serviceId = await seedService(actor);
      const blocker = await createBooking(actor, { serviceId, startsAt: "2027-08-01T09:00:00Z" });
      const mover = await createBooking(actor, { serviceId, startsAt: "2027-08-01T15:00:00Z" });
      expect([blocker.statusCode, mover.statusCode]).toEqual([201, 201]);
      const moving = mover.json<{ id: string; version: number }>();

      const res = await command(actor, moving.id, "reschedule", {
        version: moving.version,
        startsAt: "2027-08-01T09:15:00Z",
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<{ type: string }>().type).toContain("/problems/booking-overlap");
      expect(res.payload.toLowerCase()).not.toContain("bookings_no_overlap");
    });

    it("rejects rescheduling a terminal booking as 409 invalid-transition", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-09-01T09:00:00Z");
      const cancelled = await command(actor, String(created["id"]), "cancel", {
        version: created["version"],
      });
      expect(cancelled.statusCode).toBe(200);

      const res = await command(actor, String(created["id"]), "reschedule", {
        version: cancelled.json<{ version: number }>().version,
        startsAt: "2027-09-01T15:00:00Z",
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<{ type: string }>().type).toContain("/problems/invalid-transition");
    });
  });

  describe("POST /v1/bookings/:id/cancel", () => {
    it("cancels a confirmed booking, bumps the version and stores the reason", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-10-01T09:00:00Z");

      const res = await command(actor, String(created["id"]), "cancel", {
        version: created["version"],
        reason: "Client called",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "cancelled",
        version: 2,
        cancelledReason: "Client called",
      });
    });

    it("treats a re-cancel at the CURRENT version as a no-op that writes nothing", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-11-01T09:00:00Z");
      const cancelled = await command(actor, String(created["id"]), "cancel", {
        version: created["version"],
        reason: "First reason",
      });
      expect(cancelled.statusCode).toBe(200);
      const before = await storedBooking(String(created["id"]));

      const res = await command(actor, String(created["id"]), "cancel", {
        version: cancelled.json<{ version: number }>().version,
        reason: "A different reason",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(cancelled.json());
      // No write at all: version, updated_at and the reason are untouched.
      expect(await storedBooking(String(created["id"]))).toEqual(before);
    });

    it("reports a naive retry carrying the pre-cancel version as 409 stale-write", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2027-12-01T09:00:00Z");
      expect(
        (await command(actor, String(created["id"]), "cancel", { version: 1 })).statusCode,
      ).toBe(200);

      const res = await command(actor, String(created["id"]), "cancel", { version: 1 });

      expect(res.statusCode).toBe(409);
      expect(res.json<{ type: string }>().type).toContain("/problems/stale-write");
    });

    it("refuses to cancel a completed booking with 409 invalid-transition", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-01-01T09:00:00Z");
      const completed = await command(actor, String(created["id"]), "complete", { version: 1 });
      expect(completed.statusCode).toBe(200);

      const res = await command(actor, String(created["id"]), "cancel", {
        version: completed.json<{ version: number }>().version,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<{ type: string }>().type).toContain("/problems/invalid-transition");
    });
  });

  describe("POST /v1/bookings/:id/complete", () => {
    it("completes a confirmed booking and bumps the version", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-02-01T09:00:00Z");

      const res = await command(actor, String(created["id"]), "complete", { version: 1 });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "completed", version: 2 });
    });

    it("treats a re-complete at the CURRENT version as a no-op that writes nothing", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-03-01T09:00:00Z");
      const completed = await command(actor, String(created["id"]), "complete", { version: 1 });
      expect(completed.statusCode).toBe(200);
      const before = await storedBooking(String(created["id"]));

      const res = await command(actor, String(created["id"]), "complete", {
        version: completed.json<{ version: number }>().version,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(completed.json());
      expect(await storedBooking(String(created["id"]))).toEqual(before);
    });

    it("reports a stale version as 409 stale-write", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-04-01T09:00:00Z");
      expect(
        (await command(actor, String(created["id"]), "complete", { version: 1 })).statusCode,
      ).toBe(200);

      const res = await command(actor, String(created["id"]), "complete", { version: 1 });

      expect(res.statusCode).toBe(409);
      expect(res.json<{ type: string }>().type).toContain("/problems/stale-write");
    });

    it("refuses to complete a cancelled booking with 409 invalid-transition", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-05-01T09:00:00Z");
      const cancelled = await command(actor, String(created["id"]), "cancel", { version: 1 });
      expect(cancelled.statusCode).toBe(200);

      const res = await command(actor, String(created["id"]), "complete", {
        version: cancelled.json<{ version: number }>().version,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<{ type: string }>().type).toContain("/problems/invalid-transition");
    });
  });

  describe("scope guards", () => {
    it("serves no /confirm route", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-06-01T09:00:00Z");

      const res = await app.inject({
        method: "POST",
        url: `/v1/bookings/${String(created["id"])}/confirm`,
        headers: await stateHeaders(actor),
        payload: { version: 1 },
      });

      expect(res.statusCode).toBe(404);
      expect(await storedBooking(String(created["id"]))).toMatchObject({
        status: "confirmed",
        version: 1,
      });
    });

    it("serves no mutating GET", async () => {
      const actor = await seedActor(FULL_BOOKING_PERMISSIONS);
      const created = await givenConfirmedBooking(actor, "2028-07-01T09:00:00Z");

      for (const action of ["cancel", "complete", "reschedule"]) {
        const res = await app.inject({
          method: "GET",
          url: `/v1/bookings/${String(created["id"])}/${action}`,
          headers: { cookie: actor.sessionCookie },
        });
        expect(res.statusCode).toBe(404);
      }
      expect(await storedBooking(String(created["id"]))).toMatchObject({
        status: "confirmed",
        version: 1,
      });
    });
  });
});
