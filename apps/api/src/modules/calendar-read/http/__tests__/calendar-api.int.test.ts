/**
 * `GET /v1/calendar` against real PostgreSQL through the full Nest+Fastify
 * app boot (PR-09, issue #81, `contracts/calendar.contract.md`) — same
 * harness pattern as `booking/http/__tests__/booking-api.int.test.ts`.
 *
 * Real PostgreSQL is mandatory, not a convenience: the whole point of this
 * endpoint is that it composes Booking's GENERATED `blocking_range` overlap
 * semantics and Scheduling's persisted patterns/exceptions. A mocked
 * repository would prove neither, and the crossing-window and adjacency
 * cases below are decided by PostgreSQL's own `'[)'` range operators.
 *
 * The composition proof is never mocked away: every assertion runs against
 * rows written through the real Catalog/Scheduling/Booking endpoints.
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
import { BOOKING_CANCEL, BOOKING_CREATE, BOOKING_READ } from "../../../booking/index.js";
import { SCHEDULING_MANAGE, SCHEDULING_READ } from "../../../scheduling/index.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { calendarResponseSchema } from "../calendar.schema.js";

interface Actor {
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionCookie: string;
}

interface CalendarBody {
  range: { start: string; end: string };
  open: { start: string; end: string }[];
  occupied: {
    bookingId: string;
    serviceId: string;
    startsAt: string;
    occupied: { start: string; end: string };
    status: string;
  }[];
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

/**
 * Both Calendar capabilities plus what the fixtures need to WRITE the rows
 * Calendar then reads. Granted explicitly on the membership row — this suite
 * neither relies on nor establishes any default role -> capability mapping.
 */
const CALENDAR_PERMISSIONS = [
  BOOKING_READ,
  SCHEDULING_READ,
  BOOKING_CREATE,
  BOOKING_CANCEL,
  SCHEDULING_MANAGE,
  CATALOG_READ,
  CATALOG_MANAGE,
] as const;

/** A Tuesday. All fixtures hang off this day so the weekly rule below applies. */
const DAY = "2026-09-01";
const DAY_START = `${DAY}T00:00:00Z`;
const DAY_END = "2026-09-02T00:00:00Z";

describe("/v1/calendar (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  let uniqueCounter = 0;
  const unique = (): string => `${Date.now()}-${(uniqueCounter += 1)}`;

  async function seedActor(permissions: readonly string[]): Promise<Actor> {
    const suffix = unique();
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Calendar WS ${suffix}`, `calendar-ws-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Calendar User', 'active') RETURNING id`,
      [`calendar-${suffix}@example.test`],
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

  async function stateHeaders(actor: Actor): Promise<Record<string, string>> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const cookie = res.cookies.find((c) => c.name === CSRF_COOKIE);
    if (!cookie) throw new Error("CSRF bootstrap did not set a cookie");
    return {
      cookie: `${actor.sessionCookie}; ${cookie.name}=${cookie.value}`,
      "x-csrf-token": cookie.value,
    };
  }

  /** A UTC 09:00-17:00 pattern on every weekday, so `DAY` is open 09:00-17:00Z. */
  async function seedPattern(actor: Actor): Promise<void> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-patterns",
      headers: await stateHeaders(actor),
      payload: {
        timezone: "UTC",
        weeklyRule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinuteOfDay: 9 * 60,
          endMinuteOfDay: 17 * 60,
        })),
      },
    });
    if (res.statusCode !== 201) throw new Error(`pattern seed failed: ${res.payload}`);
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
        durationMinutes: 60,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
        priceAmountMinor: 4500,
        priceCurrency: "GBP",
        ...overrides,
      },
    });
    if (res.statusCode !== 201) throw new Error(`service seed failed: ${res.payload}`);
    return res.json<{ id: string }>().id;
  }

  async function seedBooking(
    actor: Actor,
    startsAt: string,
    serviceOverrides: Record<string, unknown> = {},
  ): Promise<{ id: string; serviceId: string }> {
    const serviceId = await seedService(actor, serviceOverrides);
    const res = await app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: { ...(await stateHeaders(actor)), "idempotency-key": `bk-${unique()}` },
      payload: { serviceId, startsAt },
    });
    if (res.statusCode !== 201) throw new Error(`booking seed failed: ${res.payload}`);
    return { id: res.json<{ id: string }>().id, serviceId };
  }

  function readCalendar(
    actor: Actor | null,
    from: string,
    to: string,
    extraQuery = "",
  ): Promise<LightMyRequestResponse> {
    const url = `/v1/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${extraQuery}`;
    return app.inject({
      method: "GET",
      url,
      ...(actor ? { headers: { cookie: actor.sessionCookie } } : {}),
    });
  }

  /** Every row count that a write on this endpoint could possibly change. */
  async function persistenceSnapshot(): Promise<Record<string, number>> {
    const { rows } = await admin.query<{ table_name: string; n: string }>(`
      SELECT 'bookings' AS table_name, count(*)::text AS n FROM public.bookings
      UNION ALL SELECT 'availability_patterns', count(*)::text FROM public.availability_patterns
      UNION ALL SELECT 'availability_exceptions', count(*)::text FROM public.availability_exceptions
      UNION ALL SELECT 'idempotent_requests', count(*)::text FROM public.idempotent_requests
      UNION ALL SELECT 'outbox_records', count(*)::text FROM public.outbox_records
    `);
    return Object.fromEntries(rows.map((row) => [row.table_name, Number(row.n)]));
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
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  describe("composition", () => {
    it("returns the Scheduling open intervals for the window", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(actor);

      const res = await readCalendar(actor, DAY_START, DAY_END);

      expect(res.statusCode).toBe(200);
      const body = calendarResponseSchema.parse(res.json());
      expect(body.range).toEqual({ start: DAY_START, end: DAY_END });
      expect(body.open).toEqual([{ start: `${DAY}T09:00:00Z`, end: `${DAY}T17:00:00Z` }]);
      expect(body.occupied).toEqual([]);
    });

    it("returns occupied Booking summaries for the window", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const booking = await seedBooking(actor, `${DAY}T10:00:00Z`);

      const res = await readCalendar(actor, DAY_START, DAY_END);

      expect(res.statusCode).toBe(200);
      const body = res.json<CalendarBody>();
      // No pattern seeded: open is empty, occupancy is not. The two halves
      // are genuinely independent.
      expect(body.open).toEqual([]);
      expect(body.occupied).toEqual([
        {
          bookingId: booking.id,
          serviceId: booking.serviceId,
          startsAt: `${DAY}T10:00:00Z`,
          occupied: { start: `${DAY}T10:00:00Z`, end: `${DAY}T11:00:00Z` },
          status: "confirmed",
        },
      ]);
    });

    it("composes open and occupied in one response", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(actor);
      const booking = await seedBooking(actor, `${DAY}T10:00:00Z`);

      const res = await readCalendar(actor, DAY_START, DAY_END);

      expect(res.statusCode).toBe(200);
      const body = calendarResponseSchema.parse(res.json());
      expect(body.open).toEqual([{ start: `${DAY}T09:00:00Z`, end: `${DAY}T17:00:00Z` }]);
      expect(body.occupied).toHaveLength(1);
      expect(body.occupied[0]!.bookingId).toBe(booking.id);
    });

    it("clips open intervals to the requested window rather than returning whole days", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(actor);

      const res = await readCalendar(actor, `${DAY}T10:00:00Z`, `${DAY}T12:00:00Z`);

      expect(res.statusCode).toBe(200);
      expect(res.json<CalendarBody>().open).toEqual([
        { start: `${DAY}T10:00:00Z`, end: `${DAY}T12:00:00Z` },
      ]);
    });

    it("subtracts a Scheduling exception from the open intervals (Scheduling stays the authority)", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(actor);
      const created = await app.inject({
        method: "POST",
        url: "/v1/scheduling/availability-exceptions",
        headers: await stateHeaders(actor),
        payload: { startsAt: `${DAY}T12:00:00Z`, endsAt: `${DAY}T13:00:00Z` },
      });
      expect(created.statusCode).toBe(201);

      const res = await readCalendar(actor, DAY_START, DAY_END);

      expect(res.json<CalendarBody>().open).toEqual([
        { start: `${DAY}T09:00:00Z`, end: `${DAY}T12:00:00Z` },
        { start: `${DAY}T13:00:00Z`, end: `${DAY}T17:00:00Z` },
      ]);
    });

    it("never returns a cancelled booking as occupied time", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const booking = await seedBooking(actor, `${DAY}T10:00:00Z`);
      const cancelled = await app.inject({
        method: "POST",
        url: `/v1/bookings/${booking.id}/cancel`,
        headers: await stateHeaders(actor),
        payload: { version: 1 },
      });
      expect(cancelled.statusCode).toBe(200);

      const res = await readCalendar(actor, DAY_START, DAY_END);

      expect(res.json<CalendarBody>().occupied).toEqual([]);
    });
  });

  /**
   * The PR-07A (issue #75) `blocking_range && [from, to)` semantics,
   * consumed through Booking's occupancy port and NOT re-derived here.
   */
  describe("half-open window semantics", () => {
    it("includes a booking that starts before `from` but is still occupied inside the window", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      // 09:00-11:00 occupied; the window opens at 10:00.
      const booking = await seedBooking(actor, `${DAY}T09:00:00Z`, { durationMinutes: 120 });

      const res = await readCalendar(actor, `${DAY}T10:00:00Z`, `${DAY}T12:00:00Z`);

      const body = res.json<CalendarBody>();
      expect(body.occupied.map((entry) => entry.bookingId)).toEqual([booking.id]);
      // The occupied interval is reported in full, not truncated to the
      // window: the UI must be able to see that the slot is taken from 09:00.
      expect(body.occupied[0]!.occupied).toEqual({
        start: `${DAY}T09:00:00Z`,
        end: `${DAY}T11:00:00Z`,
      });
    });

    it("includes a booking that crosses `from` only because of its pre-buffer", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      // starts 10:15, 15m pre-buffer -> occupied from 10:00; window ends 10:10.
      const booking = await seedBooking(actor, `${DAY}T10:15:00Z`, {
        durationMinutes: 30,
        preBufferMinutes: 15,
      });

      const res = await readCalendar(actor, `${DAY}T09:00:00Z`, `${DAY}T10:10:00Z`);

      expect(res.json<CalendarBody>().occupied.map((e) => e.bookingId)).toEqual([booking.id]);
    });

    it("excludes a booking whose occupied interval ends exactly at `from`", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedBooking(actor, `${DAY}T09:00:00Z`); // occupied [09:00, 10:00)

      const res = await readCalendar(actor, `${DAY}T10:00:00Z`, `${DAY}T12:00:00Z`);

      expect(res.json<CalendarBody>().occupied).toEqual([]);
    });

    it("excludes a booking whose occupied interval begins exactly at `to`", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedBooking(actor, `${DAY}T12:00:00Z`); // occupied [12:00, 13:00)

      const res = await readCalendar(actor, `${DAY}T10:00:00Z`, `${DAY}T12:00:00Z`);

      expect(res.json<CalendarBody>().occupied).toEqual([]);
    });
  });

  describe("tenant isolation", () => {
    it("never shows another workspace's availability or bookings", async () => {
      const mine = await seedActor(CALENDAR_PERMISSIONS);
      const theirs = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(theirs);
      await seedBooking(theirs, `${DAY}T10:00:00Z`);

      const res = await readCalendar(mine, DAY_START, DAY_END);

      expect(res.statusCode).toBe(200);
      const body = res.json<CalendarBody>();
      expect(body.open).toEqual([]);
      expect(body.occupied).toEqual([]);
    });
  });

  describe("authorization — BOTH capabilities are required", () => {
    it("401s with problem+json when there is no session", async () => {
      const res = await readCalendar(null, DAY_START, DAY_END);
      expect(res.statusCode).toBe(401);
      expect(res.headers["content-type"]).toContain("application/problem+json");
    });

    it("403s when the caller holds only booking:read", async () => {
      const actor = await seedActor([BOOKING_READ]);
      const res = await readCalendar(actor, DAY_START, DAY_END);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ requiredCapability?: string }>().requiredCapability).toBe(SCHEDULING_READ);
    });

    it("403s when the caller holds only scheduling:read", async () => {
      const actor = await seedActor([SCHEDULING_READ]);
      const res = await readCalendar(actor, DAY_START, DAY_END);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ requiredCapability?: string }>().requiredCapability).toBe(BOOKING_READ);
    });

    it("403s when the caller holds neither", async () => {
      const actor = await seedActor([]);
      const res = await readCalendar(actor, DAY_START, DAY_END);
      expect(res.statusCode).toBe(403);
    });

    it("200s when the caller holds both — and a permission failure is never an empty calendar", async () => {
      const restricted = await seedActor([BOOKING_READ]);
      const allowed = await seedActor([BOOKING_READ, SCHEDULING_READ]);

      expect((await readCalendar(restricted, DAY_START, DAY_END)).statusCode).toBe(403);
      expect((await readCalendar(allowed, DAY_START, DAY_END)).statusCode).toBe(200);
    });
  });

  describe("request validation", () => {
    it("422s an inverted window", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const res = await readCalendar(actor, DAY_END, DAY_START);
      expect(res.statusCode).toBe(422);
      expect(res.headers["content-type"]).toContain("application/problem+json");
    });

    it("422s an empty window", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const res = await readCalendar(actor, DAY_START, DAY_START);
      expect(res.statusCode).toBe(422);
    });

    it("422s a window beyond the expansion horizon", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const res = await readCalendar(actor, "2026-01-01T00:00:00Z", "2028-01-01T00:00:00Z");
      expect(res.statusCode).toBe(422);
      const body = res.json<{ errors?: { message: string }[] }>();
      expect(body.errors?.[0]?.message).toMatch(/370/);
    });

    it("400s a malformed instant", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const res = await readCalendar(actor, "not-a-time", DAY_END);
      expect(res.statusCode).toBe(400);
    });

    it("400s an unknown query parameter — there is no resourceId dimension", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const res = await readCalendar(actor, DAY_START, DAY_END, "&resourceId=anything");
      expect(res.statusCode).toBe(400);
    });

    it("400s a missing bound — Calendar never reads unbounded", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      const res = await app.inject({
        method: "GET",
        url: `/v1/calendar?from=${encodeURIComponent(DAY_START)}`,
        headers: { cookie: actor.sessionCookie },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("no persistence", () => {
    it("changes no row in any table and creates no Calendar table", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(actor);
      await seedBooking(actor, `${DAY}T10:00:00Z`);

      const before = await persistenceSnapshot();
      for (let i = 0; i < 3; i += 1) {
        expect((await readCalendar(actor, DAY_START, DAY_END)).statusCode).toBe(200);
      }
      expect(await persistenceSnapshot()).toEqual(before);

      // No Calendar-owned relation exists anywhere in the database.
      const { rows } = await admin.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name ILIKE '%calendar%'`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe("underlying composition failure", () => {
    it("returns a canonical problem+json and NO partial calendar data", async () => {
      const actor = await seedActor(CALENDAR_PERMISSIONS);
      await seedPattern(actor);
      await seedBooking(actor, `${DAY}T10:00:00Z`);
      // Corrupt the Scheduling side only: a stored pattern that no longer
      // satisfies its own domain invariants makes the availability read
      // throw on rehydrate. Booking's half would still succeed — the point
      // of this test is that the caller never sees it.
      await admin.query(
        `UPDATE public.availability_patterns SET timezone = $1 WHERE workspace_id = $2`,
        ["Not/AZone", actor.workspaceId],
      );

      const res = await readCalendar(actor, DAY_START, DAY_END);

      expect(res.statusCode).toBe(500);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      const body = res.json<Record<string, unknown>>();
      expect(body["type"]).toBe("https://slotnova.app/problems/internal");
      // Not a partial view: neither key leaks through the failure.
      expect(body).not.toHaveProperty("open");
      expect(body).not.toHaveProperty("occupied");
      // And nothing about the internal failure is disclosed.
      expect(JSON.stringify(body)).not.toMatch(/Not\/AZone|availability_patterns|SELECT/i);
    });
  });
});
