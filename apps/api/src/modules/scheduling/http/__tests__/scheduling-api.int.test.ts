/**
 * `/v1/scheduling/*` against real PostgreSQL through the full Nest+Fastify app
 * boot (PR-04, issue #66, `contracts/scheduling.contract.md`) — same harness
 * pattern as `catalog/http/__tests__/catalog-api.int.test.ts`.
 *
 * Real PostgreSQL is mandatory here, not a convenience: RLS tenant isolation,
 * the effective-window `daterange` overlap query and `timestamptz` round-trip
 * fidelity are database behaviour, and a mocked repository would prove none of
 * them (AGENTS.md testing expectations).
 *
 * The DST assertions deliberately compare the API's output against the MERGED
 * PR-03 domain's own expansion of the same pattern, not against hand-written
 * timestamps: the claim under test is "persistence → application → HTTP does
 * not corrupt PR-03's semantics", and only an equality against PR-03 itself
 * states that claim honestly.
 */
import { Temporal } from "@js-temporal/polyfill";
import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import { createApp } from "../../../../main.js";
import { sessionCookieName } from "../../../identity/application/session/session-cookie.js";
import { SessionService } from "../../../identity/application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../../identity/domain/ids.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { SCHEDULING_MANAGE, SCHEDULING_READ } from "../../domain/policy/capabilities.js";
import {
  MAX_EXPANSION_HORIZON_DAYS,
  createWeeklyAvailabilityPattern,
  expandWeeklyAvailability,
  type WeeklyAvailabilityRule,
} from "../../domain/recurrence.js";

interface Actor {
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionCookie: string;
}

interface ResolvedInterval {
  start: string;
  end: string;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

/** Mon–Fri 09:00–17:00 local. */
const WEEKDAYS_9_TO_5: WeeklyAvailabilityRule[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek: dayOfWeek as 1 | 2 | 3 | 4 | 5,
  startMinuteOfDay: 9 * 60,
  endMinuteOfDay: 17 * 60,
}));

/** Sundays 09:00–17:00 local — every DST transition below lands on a Sunday. */
const SUNDAY_9_TO_5: WeeklyAvailabilityRule[] = [
  { dayOfWeek: 7, startMinuteOfDay: 9 * 60, endMinuteOfDay: 17 * 60 },
];

describe("/v1/scheduling (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  let reader: Actor;
  let manager: Actor;

  let uniqueCounter = 0;
  const unique = (): string => `${Date.now()}-${(uniqueCounter += 1)}`;

  async function seedActor(permissions: readonly string[]): Promise<Actor> {
    const suffix = unique();
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Scheduling WS ${suffix}`, `scheduling-ws-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Scheduling User', 'active') RETURNING id`,
      [`scheduling-${suffix}@example.test`],
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

  async function createPattern(actor: Actor, body: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-patterns",
      headers: await stateHeaders(actor),
      payload: body,
    });
  }

  async function createException(actor: Actor, body: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/v1/scheduling/availability-exceptions",
      headers: await stateHeaders(actor),
      payload: body,
    });
  }

  async function resolve(actor: Actor, from: string, to: string) {
    return app.inject({
      method: "POST",
      url: "/v1/scheduling/availability/resolve",
      headers: await stateHeaders(actor),
      payload: { from, to },
    });
  }

  async function resolvedIntervals(actor: Actor, from: string, to: string) {
    const res = await resolve(actor, from, to);
    expect(res.statusCode).toBe(200);
    return res.json<{ intervals: ResolvedInterval[] }>().intervals;
  }

  async function patternCount(workspaceId: string): Promise<number> {
    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns WHERE workspace_id = $1`,
      [workspaceId],
    );
    return Number(rows[0]!.count);
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

    reader = await seedActor([SCHEDULING_READ]);
    manager = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  describe("POST /v1/scheduling/availability-patterns", () => {
    it("creates a pattern and returns 201 with the persisted representation", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-10-01",
      });

      expect(res.statusCode).toBe(201);
      const body = res.json<Record<string, unknown>>();
      expect(body).toMatchObject({
        timezone: "Europe/London",
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-10-01",
      });
      expect(body["weeklyRule"]).toEqual(WEEKDAYS_9_TO_5);
      // No tenant internals leak into the response body.
      expect(body["workspaceId"]).toBeUndefined();
      expect(await patternCount(actor.workspaceId)).toBe(1);
    });

    it("accepts a pattern with no effective bounds", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createPattern(actor, {
        timezone: "America/New_York",
        weeklyRule: WEEKDAYS_9_TO_5,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ effectiveFrom: null, effectiveUntil: null });
    });

    it("rejects an unrecognised IANA timezone with 422 and persists nothing", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      for (const timezone of ["Not/AZone", "+05:00", "GMT+1"]) {
        const res = await createPattern(actor, { timezone, weeklyRule: WEEKDAYS_9_TO_5 });
        expect(res.statusCode, timezone).toBe(422);
        expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("timezone");
      }
      expect(await patternCount(actor.workspaceId)).toBe(0);
    });

    it("rejects weekly intervals overlapping within a day with 422 and persists nothing", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: [
          { dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 780 },
          { dayOfWeek: 1, startMinuteOfDay: 720, endMinuteOfDay: 1020 },
        ],
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("weeklyRule");
      expect(await patternCount(actor.workspaceId)).toBe(0);
    });

    it("permits touching (adjacent) weekly intervals within a day — half-open semantics", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: [
          { dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 720 },
          { dayOfWeek: 1, startMinuteOfDay: 720, endMinuteOfDay: 1020 },
        ],
      });
      expect(res.statusCode).toBe(201);
    });

    it("rejects an inverted effective range with 422", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-10-01",
        effectiveUntil: "2026-09-01",
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("effectiveUntil");
    });

    it("rejects an equal effective range (the window would be empty)", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-09-01",
      });
      expect(res.statusCode).toBe(422);
    });

    it("rejects a malformed payload with 400 (schema level), not 422", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      for (const payload of [
        { weeklyRule: WEEKDAYS_9_TO_5 },
        { timezone: "Europe/London" },
        { timezone: "Europe/London", weeklyRule: "mon-fri" },
        { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5, effectiveFrom: "01/09/2026" },
        {
          timezone: "Europe/London",
          weeklyRule: WEEKDAYS_9_TO_5,
          resourceId: "11111111-1111-4111-8111-111111111111",
        },
      ]) {
        const res = await createPattern(actor, payload);
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      }
      expect(await patternCount(actor.workspaceId)).toBe(0);
    });
  });

  describe("pattern-history invariant (no two simultaneously-effective patterns)", () => {
    it("rejects a second pattern whose effective window overlaps an existing one", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const first = await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-11-01",
      });
      expect(first.statusCode).toBe(201);

      for (const window of [
        { effectiveFrom: "2026-09-01", effectiveUntil: "2026-11-01" },
        { effectiveFrom: "2026-10-01", effectiveUntil: "2026-12-01" },
        { effectiveFrom: "2026-08-01", effectiveUntil: "2026-09-02" },
        {},
      ]) {
        const res = await createPattern(actor, {
          timezone: "Europe/London",
          weeklyRule: WEEKDAYS_9_TO_5,
          ...window,
        });
        expect(res.statusCode, JSON.stringify(window)).toBe(422);
        expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("effectiveFrom");
      }

      expect(await patternCount(actor.workspaceId)).toBe(1);
    });

    it("accepts adjacent (non-overlapping) history because effectiveUntil is exclusive", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      for (const window of [
        { effectiveFrom: "2026-09-01", effectiveUntil: "2026-10-01" },
        { effectiveFrom: "2026-10-01", effectiveUntil: "2026-11-01" },
        { effectiveFrom: "2026-11-01" },
      ]) {
        const res = await createPattern(actor, {
          timezone: "Europe/London",
          weeklyRule: WEEKDAYS_9_TO_5,
          ...window,
        });
        expect(res.statusCode, JSON.stringify(window)).toBe(201);
      }
      expect(await patternCount(actor.workspaceId)).toBe(3);
    });

    it("scopes the invariant per workspace — another workspace's window never blocks one", async () => {
      const a = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const b = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const window = {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-10-01",
      };
      expect((await createPattern(a, window)).statusCode).toBe(201);
      expect((await createPattern(b, window)).statusCode).toBe(201);
    });
  });

  describe("GET /v1/scheduling/availability-patterns", () => {
    it("lists this workspace's patterns in deterministic effective-date order", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      for (const window of [
        { effectiveFrom: "2026-11-01", effectiveUntil: "2026-12-01" },
        { effectiveUntil: "2026-09-01" },
        { effectiveFrom: "2026-09-01", effectiveUntil: "2026-10-01" },
      ]) {
        expect(
          (
            await createPattern(actor, {
              timezone: "Europe/London",
              weeklyRule: WEEKDAYS_9_TO_5,
              ...window,
            })
          ).statusCode,
        ).toBe(201);
      }

      const list = await app.inject({
        method: "GET",
        url: "/v1/scheduling/availability-patterns",
        headers: { cookie: actor.sessionCookie },
      });
      expect(list.statusCode).toBe(200);
      const items = list.json<{ items: { effectiveFrom: string | null }[] }>().items;
      expect(items.map((item) => item.effectiveFrom)).toEqual([null, "2026-09-01", "2026-11-01"]);
    });

    it("never returns another workspace's patterns", async () => {
      const a = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const b = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      expect(
        (await createPattern(a, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 }))
          .statusCode,
      ).toBe(201);

      const list = await app.inject({
        method: "GET",
        url: "/v1/scheduling/availability-patterns",
        headers: { cookie: b.sessionCookie },
      });
      expect(list.json<{ items: unknown[] }>().items).toEqual([]);
    });
  });

  describe("POST /v1/scheduling/availability-exceptions", () => {
    it("creates an exception from resolved instants and returns 201", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createException(actor, {
        startsAt: "2026-09-02T10:00:00Z",
        endsAt: "2026-09-02T12:00:00Z",
        reason: "Dentist",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        startsAt: "2026-09-02T10:00:00Z",
        endsAt: "2026-09-02T12:00:00Z",
        reason: "Dentist",
      });
      expect(res.json<Record<string, unknown>>()["workspaceId"]).toBeUndefined();
    });

    it("normalises an offset instant to UTC without moving it", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const res = await createException(actor, {
        startsAt: "2026-09-02T11:00:00+01:00",
        endsAt: "2026-09-02T13:00:00+01:00",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        startsAt: "2026-09-02T10:00:00Z",
        endsAt: "2026-09-02T12:00:00Z",
        reason: null,
      });
    });

    it("rejects startsAt >= endsAt with 422", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      for (const [startsAt, endsAt] of [
        ["2026-09-02T12:00:00Z", "2026-09-02T10:00:00Z"],
        ["2026-09-02T12:00:00Z", "2026-09-02T12:00:00Z"],
      ]) {
        const res = await createException(actor, { startsAt, endsAt });
        expect(res.statusCode).toBe(422);
        expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("endsAt");
      }
    });

    it("rejects a recurrence representation or a bare local time with 400", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const recurring = await createException(actor, {
        startsAt: "2026-09-02T10:00:00Z",
        endsAt: "2026-09-02T12:00:00Z",
        rrule: "FREQ=WEEKLY",
      });
      expect(recurring.statusCode).toBe(400);

      const bareLocal = await createException(actor, {
        startsAt: "2026-09-02T10:00:00",
        endsAt: "2026-09-02T12:00:00",
      });
      expect(bareLocal.statusCode).toBe(400);
    });
  });

  describe("POST /v1/scheduling/availability/resolve", () => {
    it("returns half-open UTC intervals for the effective pattern", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });

      // 2026-09-07 is a Monday; the window covers Mon + Tue only.
      const intervals = await resolvedIntervals(actor, "2026-09-07", "2026-09-09");
      expect(intervals).toEqual([
        { start: "2026-09-07T08:00:00Z", end: "2026-09-07T16:00:00Z" },
        { start: "2026-09-08T08:00:00Z", end: "2026-09-08T16:00:00Z" },
      ]);
    });

    it("returns an empty list when the workspace has no pattern", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      expect(await resolvedIntervals(actor, "2026-09-07", "2026-09-09")).toEqual([]);
    });

    it("persists nothing (it is a pure query)", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      const before = await patternCount(actor.workspaceId);

      await resolvedIntervals(actor, "2026-09-07", "2026-09-14");

      expect(await patternCount(actor.workspaceId)).toBe(before);
      const { rows } = await admin.query(
        `SELECT id FROM public.availability_exceptions WHERE workspace_id = $1`,
        [actor.workspaceId],
      );
      expect(rows).toHaveLength(0);
    });

    it("subtracts overlapping exceptions, splitting an interval in two (FR-012)", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      // Monday 2026-09-07 is 08:00Z-16:00Z; remove 10:00Z-12:00Z from the middle.
      await createException(actor, {
        startsAt: "2026-09-07T10:00:00Z",
        endsAt: "2026-09-07T12:00:00Z",
        reason: "Dentist",
      });

      expect(await resolvedIntervals(actor, "2026-09-07", "2026-09-08")).toEqual([
        { start: "2026-09-07T08:00:00Z", end: "2026-09-07T10:00:00Z" },
        { start: "2026-09-07T12:00:00Z", end: "2026-09-07T16:00:00Z" },
      ]);
    });

    it("removes a day entirely when an exception covers it, and leaves neighbours intact", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      await createException(actor, {
        startsAt: "2026-09-08T00:00:00Z",
        endsAt: "2026-09-09T00:00:00Z",
        reason: "Time off",
      });

      const intervals = await resolvedIntervals(actor, "2026-09-07", "2026-09-10");
      expect(intervals.map((interval) => interval.start)).toEqual([
        "2026-09-07T08:00:00Z",
        "2026-09-09T08:00:00Z",
      ]);
    });

    it("an exception that merely touches an interval removes nothing (half-open)", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      await createException(actor, {
        startsAt: "2026-09-07T16:00:00Z",
        endsAt: "2026-09-07T18:00:00Z",
      });

      expect(await resolvedIntervals(actor, "2026-09-07", "2026-09-08")).toEqual([
        { start: "2026-09-07T08:00:00Z", end: "2026-09-07T16:00:00Z" },
      ]);
    });

    it("never applies another workspace's exception or pattern", async () => {
      const a = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      const b = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(a, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      await createException(b, {
        startsAt: "2026-09-07T00:00:00Z",
        endsAt: "2026-09-08T00:00:00Z",
        reason: "B is away",
      });

      // A's Monday is untouched by B's time off ...
      expect(await resolvedIntervals(a, "2026-09-07", "2026-09-08")).toEqual([
        { start: "2026-09-07T08:00:00Z", end: "2026-09-07T16:00:00Z" },
      ]);
      // ... and B sees no availability at all, because A's pattern is not B's.
      expect(await resolvedIntervals(b, "2026-09-07", "2026-09-08")).toEqual([]);
    });

    it("rejects an inverted or empty range with 422", async () => {
      const actor = await seedActor([SCHEDULING_READ]);
      for (const [from, to] of [
        ["2026-09-08", "2026-09-07"],
        ["2026-09-07", "2026-09-07"],
      ]) {
        const res = await resolve(actor, from!, to!);
        expect(res.statusCode).toBe(422);
        expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("to");
      }
    });

    it("rejects a malformed range with 400", async () => {
      const actor = await seedActor([SCHEDULING_READ]);
      const res = await app.inject({
        method: "POST",
        url: "/v1/scheduling/availability/resolve",
        headers: await stateHeaders(actor),
        payload: { from: "2026-09-07" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("effectiveUntil is EXCLUSIVE (Founder decision)", () => {
    it("generates on and after effectiveFrom but never on effectiveUntil or later", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-10-01",
      });

      // 2026-08-31 is a Monday immediately before the window: excluded.
      expect(await resolvedIntervals(actor, "2026-08-31", "2026-09-01")).toEqual([]);
      // 2026-09-01 is a Tuesday, the first effective day: included.
      expect(await resolvedIntervals(actor, "2026-09-01", "2026-09-02")).toEqual([
        { start: "2026-09-01T08:00:00Z", end: "2026-09-01T16:00:00Z" },
      ]);
      // 2026-09-30 is the last effective weekday: included.
      expect(await resolvedIntervals(actor, "2026-09-30", "2026-10-01")).toEqual([
        { start: "2026-09-30T08:00:00Z", end: "2026-09-30T16:00:00Z" },
      ]);
      // THE BOUNDARY: 2026-10-01 is a Thursday matching the weekly rule, and
      // it is the exclusive upper bound -- nothing may be generated for it.
      expect(await resolvedIntervals(actor, "2026-10-01", "2026-10-02")).toEqual([]);
      // ... nor for any later day.
      expect(await resolvedIntervals(actor, "2026-10-01", "2026-10-09")).toEqual([]);
    });

    it("a request spanning the boundary stops exactly at it", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-10-01",
      });

      const intervals = await resolvedIntervals(actor, "2026-09-28", "2026-10-05");
      expect(intervals.map((interval) => interval.start.slice(0, 10))).toEqual([
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
      ]);
    });

    it("hands over cleanly between two adjacent history windows", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: [{ dayOfWeek: 4, startMinuteOfDay: 9 * 60, endMinuteOfDay: 10 * 60 }],
        effectiveFrom: "2026-09-01",
        effectiveUntil: "2026-10-01",
      });
      await createPattern(actor, {
        timezone: "Europe/London",
        weeklyRule: [{ dayOfWeek: 4, startMinuteOfDay: 14 * 60, endMinuteOfDay: 15 * 60 }],
        effectiveFrom: "2026-10-01",
      });

      // 2026-09-24 and 2026-10-01 are both Thursdays, one on each side.
      expect(await resolvedIntervals(actor, "2026-09-24", "2026-10-02")).toEqual([
        { start: "2026-09-24T08:00:00Z", end: "2026-09-24T09:00:00Z" },
        { start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" },
      ]);
    });
  });

  describe("370-day expansion horizon", () => {
    it("accepts a request of exactly 370 days", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      const from = Temporal.PlainDate.from("2026-01-01");
      const to = from.add({ days: MAX_EXPANSION_HORIZON_DAYS });

      const res = await resolve(actor, from.toString(), to.toString());
      expect(res.statusCode).toBe(200);
      expect(res.json<{ intervals: unknown[] }>().intervals.length).toBeGreaterThan(200);
    });

    it("rejects a request of 371 days with canonical 422 problem+json", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: WEEKDAYS_9_TO_5 });
      const from = Temporal.PlainDate.from("2026-01-01");
      const to = from.add({ days: MAX_EXPANSION_HORIZON_DAYS + 1 });

      const res = await resolve(actor, from.toString(), to.toString());
      expect(res.statusCode).toBe(422);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      const body = res.json<{ type: string; errors: { path: string; message: string }[] }>();
      expect(body.type).toContain("/problems/validation");
      expect(body.errors[0]!.path).toBe("to");
      expect(body.errors[0]!.message).toContain("370");
    });

    it("leaks no SQL, table name or PostgreSQL error text in the rejection", async () => {
      const actor = await seedActor([SCHEDULING_READ]);
      const from = Temporal.PlainDate.from("2026-01-01");
      const res = await resolve(
        actor,
        from.toString(),
        from.add({ days: MAX_EXPANSION_HORIZON_DAYS + 1 }).toString(),
      );
      const raw = res.payload.toLowerCase();
      for (const leak of [
        "availability_patterns",
        "availability_exceptions",
        "select",
        "insert",
        "daterange",
        "sqlstate",
        "temporal",
      ]) {
        expect(raw, leak).not.toContain(leak);
      }
    });
  });

  describe("DST integration (persistence -> application -> HTTP)", () => {
    /** The same pattern, expanded by the merged PR-03 domain directly. */
    function pr03Expansion(timezone: string, from: string, to: string): ResolvedInterval[] {
      return expandWeeklyAvailability(
        createWeeklyAvailabilityPattern({ timeZone: timezone, rules: SUNDAY_9_TO_5 }),
        { from: Temporal.PlainDate.from(from), to: Temporal.PlainDate.from(to) },
      ).map((interval) => ({ start: interval.start.toString(), end: interval.end.toString() }));
    }

    it("Europe/London: a persisted pattern spanning spring-forward matches PR-03 exactly", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: SUNDAY_9_TO_5 });

      const intervals = await resolvedIntervals(actor, "2026-03-22", "2026-03-30");
      expect(intervals).toEqual(pr03Expansion("Europe/London", "2026-03-22", "2026-03-30"));
      // GMT before the transition, BST after it: the same 09:00 local is a
      // different instant, which is the whole point.
      expect(intervals).toEqual([
        { start: "2026-03-22T09:00:00Z", end: "2026-03-22T17:00:00Z" },
        { start: "2026-03-29T08:00:00Z", end: "2026-03-29T16:00:00Z" },
      ]);
    });

    it("Europe/London: a persisted pattern spanning fall-back matches PR-03 exactly", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: SUNDAY_9_TO_5 });

      const intervals = await resolvedIntervals(actor, "2026-10-18", "2026-10-26");
      expect(intervals).toEqual(pr03Expansion("Europe/London", "2026-10-18", "2026-10-26"));
      expect(intervals).toEqual([
        { start: "2026-10-18T08:00:00Z", end: "2026-10-18T16:00:00Z" },
        { start: "2026-10-25T09:00:00Z", end: "2026-10-25T17:00:00Z" },
      ]);
    });

    it("America/New_York: both transitions match PR-03 exactly", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "America/New_York", weeklyRule: SUNDAY_9_TO_5 });

      const spring = await resolvedIntervals(actor, "2026-03-01", "2026-03-09");
      expect(spring).toEqual(pr03Expansion("America/New_York", "2026-03-01", "2026-03-09"));
      expect(spring).toEqual([
        { start: "2026-03-01T14:00:00Z", end: "2026-03-01T22:00:00Z" },
        { start: "2026-03-08T13:00:00Z", end: "2026-03-08T21:00:00Z" },
      ]);

      const fall = await resolvedIntervals(actor, "2026-10-25", "2026-11-02");
      expect(fall).toEqual(pr03Expansion("America/New_York", "2026-10-25", "2026-11-02"));
      expect(fall).toEqual([
        { start: "2026-10-25T13:00:00Z", end: "2026-10-25T21:00:00Z" },
        { start: "2026-11-01T14:00:00Z", end: "2026-11-01T22:00:00Z" },
      ]);
    });

    it("the host timezone does not affect the output", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: SUNDAY_9_TO_5 });

      const originalTz = process.env["TZ"];
      const results: ResolvedInterval[][] = [];
      try {
        for (const hostZone of ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"]) {
          process.env["TZ"] = hostZone;
          results.push(await resolvedIntervals(actor, "2026-03-22", "2026-03-30"));
        }
      } finally {
        if (originalTz === undefined) delete process.env["TZ"];
        else process.env["TZ"] = originalTz;
      }

      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
      expect(results[0]).toEqual([
        { start: "2026-03-22T09:00:00Z", end: "2026-03-22T17:00:00Z" },
        { start: "2026-03-29T08:00:00Z", end: "2026-03-29T16:00:00Z" },
      ]);
    });

    it("an exception subtracts correctly across a DST transition", async () => {
      const actor = await seedActor([SCHEDULING_READ, SCHEDULING_MANAGE]);
      await createPattern(actor, { timezone: "Europe/London", weeklyRule: SUNDAY_9_TO_5 });
      // 2026-03-29 local 09:00-17:00 BST is 08:00Z-16:00Z; remove its middle.
      await createException(actor, {
        startsAt: "2026-03-29T10:00:00Z",
        endsAt: "2026-03-29T11:00:00Z",
      });

      expect(await resolvedIntervals(actor, "2026-03-29", "2026-03-30")).toEqual([
        { start: "2026-03-29T08:00:00Z", end: "2026-03-29T10:00:00Z" },
        { start: "2026-03-29T11:00:00Z", end: "2026-03-29T16:00:00Z" },
      ]);
    });
  });

  describe("authorization", () => {
    it("requires scheduling:read for the list and resolve endpoints", async () => {
      const noCapability = await seedActor([]);

      const list = await app.inject({
        method: "GET",
        url: "/v1/scheduling/availability-patterns",
        headers: { cookie: noCapability.sessionCookie },
      });
      expect(list.statusCode).toBe(403);
      expect(list.json<Record<string, unknown>>()["requiredCapability"]).toBe(SCHEDULING_READ);

      const resolved = await resolve(noCapability, "2026-09-07", "2026-09-08");
      expect(resolved.statusCode).toBe(403);
      expect(resolved.json<Record<string, unknown>>()["requiredCapability"]).toBe(SCHEDULING_READ);
    });

    it("requires scheduling:manage for both create endpoints — read alone is not enough", async () => {
      const pattern = await createPattern(reader, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
      });
      expect(pattern.statusCode).toBe(403);
      expect(pattern.json<Record<string, unknown>>()["requiredCapability"]).toBe(SCHEDULING_MANAGE);

      const exception = await createException(reader, {
        startsAt: "2026-09-02T10:00:00Z",
        endsAt: "2026-09-02T12:00:00Z",
      });
      expect(exception.statusCode).toBe(403);
      expect(exception.json<Record<string, unknown>>()["requiredCapability"]).toBe(
        SCHEDULING_MANAGE,
      );

      expect(await patternCount(reader.workspaceId)).toBe(0);
    });

    it("returns the canonical 401 with no session at all", async () => {
      for (const [method, url] of [
        ["GET", "/v1/scheduling/availability-patterns"],
        ["POST", "/v1/scheduling/availability/resolve"],
        ["POST", "/v1/scheduling/availability-patterns"],
        ["POST", "/v1/scheduling/availability-exceptions"],
      ] as const) {
        const csrf = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
        const cookie = csrf.cookies.find((c) => c.name === CSRF_COOKIE)!;
        const res = await app.inject({
          method,
          url,
          headers:
            method === "GET"
              ? {}
              : { cookie: `${cookie.name}=${cookie.value}`, "x-csrf-token": cookie.value },
          ...(method === "GET" ? {} : { payload: { from: "2026-09-07", to: "2026-09-08" } }),
        });
        expect(res.statusCode, url).toBe(401);
        expect(res.json<Record<string, unknown>>()["type"], url).toContain(
          "/problems/session-invalid",
        );
      }
    });

    it("manager capability succeeds where reader failed", async () => {
      const res = await createPattern(manager, {
        timezone: "Europe/London",
        weeklyRule: WEEKDAYS_9_TO_5,
      });
      expect(res.statusCode).toBe(201);
    });
  });
});
