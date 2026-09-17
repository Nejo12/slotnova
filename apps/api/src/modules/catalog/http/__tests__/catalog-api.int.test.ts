/**
 * `/v1/catalog/*` against real PostgreSQL through the full Nest+Fastify app
 * boot (PR-02, issue #60, `contracts/catalog.contract.md`) — same harness
 * pattern as `identity/http/__tests__/workspace-context.int.test.ts`.
 *
 * Real PostgreSQL is mandatory here, not a convenience: RLS tenant isolation,
 * the composite category/workspace foreign key and the
 * `idempotent_requests` unique index are database behavior, and a mocked
 * repository would prove none of them (AGENTS.md testing expectations).
 *
 * The idempotency assertions deliberately check `services` ROW COUNTS, not
 * only that two HTTP responses matched: equal responses are exactly what a
 * broken implementation that created two rows and returned the second would
 * also produce.
 */
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
import { CATALOG_MANAGE, CATALOG_READ } from "../../domain/policy/capabilities.js";

interface Actor {
  readonly workspaceId: string;
  readonly userId: string;
  readonly sessionCookie: string;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

describe("/v1/catalog (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  let reader: Actor;
  let manager: Actor;
  let otherManager: Actor;

  let uniqueCounter = 0;
  const unique = (): string => `${Date.now()}-${(uniqueCounter += 1)}`;

  async function seedActor(permissions: readonly string[]): Promise<Actor> {
    const suffix = unique();
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Catalog WS ${suffix}`, `catalog-ws-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Catalog User', 'active') RETURNING id`,
      [`catalog-${suffix}@example.test`],
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

  async function createService(
    actor: Actor,
    body: Record<string, unknown>,
    idempotencyKey = `key-${unique()}`,
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: { ...(await stateHeaders(actor)), "idempotency-key": idempotencyKey },
      payload: body,
    });
  }

  async function serviceCount(workspaceId: string): Promise<number> {
    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.services WHERE workspace_id = $1`,
      [workspaceId],
    );
    return Number(rows[0]!.count);
  }

  const baseService = {
    name: "Cut & finish",
    durationMinutes: 45,
    priceAmountMinor: 4500,
    priceCurrency: "GBP",
  };

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();

    // Resolved from the booted app rather than hand-constructed: this test
    // must not reach into another module's repository internals
    // (`no-cross-module-internals`), and the app's own instance is the one
    // the endpoints under test actually validate against.
    sessions = app.get(SessionService);

    reader = await seedActor([CATALOG_READ]);
    manager = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
    otherManager = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  describe("POST /v1/catalog/services", () => {
    it("creates a service and returns 201 with the persisted representation", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const res = await createService(actor, { ...baseService, preBufferMinutes: 5 });

      expect(res.statusCode).toBe(201);
      const body = res.json<Record<string, unknown>>();
      expect(body).toMatchObject({
        name: "Cut & finish",
        durationMinutes: 45,
        preBufferMinutes: 5,
        postBufferMinutes: 0,
        priceAmountMinor: 4500,
        priceCurrency: "GBP",
        categoryId: null,
        active: true,
      });
      // No tenant internals leak into the response body.
      expect(body["workspaceId"]).toBeUndefined();
      expect(await serviceCount(actor.workspaceId)).toBe(1);
    });

    it("replays the original 201 for the same key + same request, creating exactly one row", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const key = `replay-${unique()}`;

      const first = await createService(actor, baseService, key);
      const second = await createService(actor, baseService, key);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(await serviceCount(actor.workspaceId)).toBe(1);
    });

    it("replays regardless of request property ORDER (canonical fingerprint)", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const key = `order-${unique()}`;

      const first = await createService(
        actor,
        { name: "A", durationMinutes: 30, priceAmountMinor: 1000, priceCurrency: "GBP" },
        key,
      );
      const second = await createService(
        actor,
        { priceCurrency: "GBP", priceAmountMinor: 1000, durationMinutes: 30, name: "A" },
        key,
      );

      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(await serviceCount(actor.workspaceId)).toBe(1);
    });

    it("conflicts (409) on the same key with a materially different request, creating no second row", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const key = `conflict-${unique()}`;

      const first = await createService(actor, baseService, key);
      const conflicting = await createService(actor, { ...baseService, durationMinutes: 60 }, key);

      expect(first.statusCode).toBe(201);
      expect(conflicting.statusCode).toBe(409);
      expect(conflicting.json<Record<string, unknown>>()["type"]).toContain(
        "/problems/idempotency-conflict",
      );
      expect(await serviceCount(actor.workspaceId)).toBe(1);
    });

    it("scopes idempotency keys per workspace — the same key in two workspaces is independent", async () => {
      const a = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const b = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const key = `shared-${unique()}`;

      const first = await createService(a, baseService, key);
      const second = await createService(b, baseService, key);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json<Record<string, unknown>>()["id"]).not.toBe(
        first.json<Record<string, unknown>>()["id"],
      );
      expect(await serviceCount(a.workspaceId)).toBe(1);
      expect(await serviceCount(b.workspaceId)).toBe(1);
    });

    it("rolls the idempotency claim back with a failed creation, so the key stays usable", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const key = `rollback-${unique()}`;

      // Fails on a domain invariant *inside* the claimed transaction.
      const failed = await createService(actor, { ...baseService, durationMinutes: 0 }, key);
      expect(failed.statusCode).toBe(422);
      expect(await serviceCount(actor.workspaceId)).toBe(0);

      const retried = await createService(actor, { ...baseService, durationMinutes: 0 }, key);
      // Same failure, not a replayed/poisoned key and not a conflict.
      expect(retried.statusCode).toBe(422);

      const succeeded = await createService(actor, baseService, key);
      expect(succeeded.statusCode).toBe(201);
      expect(await serviceCount(actor.workspaceId)).toBe(1);
    });

    it("requires the Idempotency-Key header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/catalog/services",
        headers: await stateHeaders(manager),
        payload: baseService,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<Record<string, unknown>>()["type"]).toContain("/problems/validation");
    });

    it.each([
      ["zero duration", { durationMinutes: 0 }],
      ["negative buffer", { preBufferMinutes: -1 }],
      ["negative price", { priceAmountMinor: -1 }],
      ["unsupported currency", { priceCurrency: "XYZ" }],
      ["blank name", { name: "   " }],
    ])("rejects %s with 422 and creates nothing", async (_label, override) => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const res = await createService(actor, { ...baseService, ...override });
      expect(res.statusCode).toBe(422);
      expect(await serviceCount(actor.workspaceId)).toBe(0);
    });

    it("rejects an unknown request property with 400 rather than dropping it", async () => {
      const res = await createService(manager, { ...baseService, deposit: 100 });
      expect(res.statusCode).toBe(400);
    });

    it("associates an in-workspace category", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const category = await app.inject({
        method: "POST",
        url: "/v1/catalog/categories",
        headers: await stateHeaders(actor),
        payload: { name: "Colour" },
      });
      expect(category.statusCode).toBe(201);
      const categoryId = category.json<Record<string, string>>()["id"];

      const res = await createService(actor, { ...baseService, categoryId });
      expect(res.statusCode).toBe(201);
      expect(res.json<Record<string, unknown>>()["categoryId"]).toBe(categoryId);
    });

    it.each([
      ["nonexistent", "11111111-1111-4111-8111-111111111111"],
      ["cross-workspace", null],
    ])("rejects a %s category identically, with no existence disclosure", async (label, fixed) => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      let categoryId = fixed;
      if (categoryId === null) {
        const foreign = await app.inject({
          method: "POST",
          url: "/v1/catalog/categories",
          headers: await stateHeaders(otherManager),
          payload: { name: `Foreign ${label}` },
        });
        categoryId = foreign.json<Record<string, string>>()["id"]!;
      }

      const res = await createService(actor, { ...baseService, categoryId });
      expect(res.statusCode).toBe(422);
      const body = res.json<Record<string, unknown>>();
      expect(body["type"]).toContain("/problems/validation");
      // The rejected id is never echoed back.
      expect(JSON.stringify(body)).not.toContain(categoryId);
      expect(await serviceCount(actor.workspaceId)).toBe(0);
    });

    it("rejects a caller without catalog:manage with 403, and an unauthenticated caller with 401", async () => {
      const forbidden = await createService(reader, baseService);
      expect(forbidden.statusCode).toBe(403);

      const csrf = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
      const csrfCookie = csrf.cookies.find((c) => c.name === CSRF_COOKIE)!;
      const anonymous = await app.inject({
        method: "POST",
        url: "/v1/catalog/services",
        headers: {
          cookie: `${csrfCookie.name}=${csrfCookie.value}`,
          "x-csrf-token": csrfCookie.value,
          "idempotency-key": `anon-${unique()}`,
        },
        payload: baseService,
      });
      expect(anonymous.statusCode).toBe(401);
    });
  });

  describe("GET /v1/catalog/services/:id", () => {
    it("returns a service in the active workspace", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const created = await createService(actor, baseService);
      const id = created.json<Record<string, string>>()["id"];

      const res = await app.inject({
        method: "GET",
        url: `/v1/catalog/services/${id}`,
        headers: { cookie: actor.sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Record<string, unknown>>()["id"]).toBe(id);
    });

    it("is indistinguishable between an unknown id and another workspace's id", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const foreign = await createService(otherManager, baseService);
      const foreignId = foreign.json<Record<string, string>>()["id"];

      const unknown = await app.inject({
        method: "GET",
        url: "/v1/catalog/services/11111111-1111-4111-8111-111111111111",
        headers: { cookie: actor.sessionCookie },
      });
      const crossWorkspace = await app.inject({
        method: "GET",
        url: `/v1/catalog/services/${foreignId}`,
        headers: { cookie: actor.sessionCookie },
      });

      expect(unknown.statusCode).toBe(404);
      expect(crossWorkspace.statusCode).toBe(404);
      expect(crossWorkspace.json()).toEqual({
        ...unknown.json<Record<string, unknown>>(),
        instance: crossWorkspace.json<Record<string, string>>()["instance"],
      });
    });
    it("rejects a caller without catalog:read with 403, before disclosing whether the id exists", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const created = await createService(actor, baseService);
      const id = created.json<Record<string, string>>()["id"];
      const noCapability = await seedActor([]);

      const res = await app.inject({
        method: "GET",
        url: `/v1/catalog/services/${id}`,
        headers: { cookie: noCapability.sessionCookie },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /v1/catalog/services", () => {
    it("lists only the active workspace's services, filters by `active`, and pages by cursor", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      await createService(otherManager, { ...baseService, name: "Foreign service" });

      for (const name of ["A", "B", "C"]) {
        const created = await createService(actor, { ...baseService, name });
        if (name === "C") {
          const id = created.json<Record<string, string>>()["id"];
          await app.inject({
            method: "PATCH",
            url: `/v1/catalog/services/${id}`,
            headers: await stateHeaders(actor),
            payload: { active: false },
          });
        }
      }

      const all = await app.inject({
        method: "GET",
        url: "/v1/catalog/services",
        headers: { cookie: actor.sessionCookie },
      });
      expect(all.statusCode).toBe(200);
      const allBody = all.json<{ items: { name: string }[]; nextCursor: string | null }>();
      expect(allBody.items.map((i) => i.name).sort()).toEqual(["A", "B", "C"]);
      expect(allBody.items.some((i) => i.name === "Foreign service")).toBe(false);
      expect(allBody.nextCursor).toBeNull();

      const activeOnly = await app.inject({
        method: "GET",
        url: "/v1/catalog/services?active=true",
        headers: { cookie: actor.sessionCookie },
      });
      expect(
        activeOnly
          .json<{ items: { name: string }[] }>()
          .items.map((i) => i.name)
          .sort(),
      ).toEqual(["A", "B"]);

      const inactiveOnly = await app.inject({
        method: "GET",
        url: "/v1/catalog/services?active=false",
        headers: { cookie: actor.sessionCookie },
      });
      expect(inactiveOnly.json<{ items: { name: string }[] }>().items.map((i) => i.name)).toEqual([
        "C",
      ]);

      // Page 1 of 3 must advertise a cursor; following it must return the
      // remaining rows exactly once each.
      const page1 = await app.inject({
        method: "GET",
        url: "/v1/catalog/services?limit=2",
        headers: { cookie: actor.sessionCookie },
      });
      const page1Body = page1.json<{ items: { id: string }[]; nextCursor: string | null }>();
      expect(page1Body.items).toHaveLength(2);
      expect(page1Body.nextCursor).toBe(page1Body.items[1]!.id);

      const page2 = await app.inject({
        method: "GET",
        url: `/v1/catalog/services?limit=2&cursor=${page1Body.nextCursor!}`,
        headers: { cookie: actor.sessionCookie },
      });
      const page2Body = page2.json<{ items: { id: string }[]; nextCursor: string | null }>();
      expect(page2Body.items).toHaveLength(1);
      expect(page2Body.nextCursor).toBeNull();
      expect(page2Body.items[0]!.id).not.toBe(page1Body.items[0]!.id);
    });

    it("rejects a caller without catalog:read with 403", async () => {
      const noCapability = await seedActor([]);
      const res = await app.inject({
        method: "GET",
        url: "/v1/catalog/services",
        headers: { cookie: noCapability.sessionCookie },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /v1/catalog/services/:id", () => {
    it("applies an approved partial update, including the active toggle", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const created = await createService(actor, baseService);
      const id = created.json<Record<string, string>>()["id"];

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/catalog/services/${id}`,
        headers: await stateHeaders(actor),
        payload: { name: "Renamed", durationMinutes: 60, active: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id,
        name: "Renamed",
        durationMinutes: 60,
        active: false,
        // Untouched fields are preserved, not reset to a default.
        priceAmountMinor: 4500,
        priceCurrency: "GBP",
      });
    });

    it("rejects an invalid domain update with 422", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const created = await createService(actor, baseService);
      const id = created.json<Record<string, string>>()["id"];

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/catalog/services/${id}`,
        headers: await stateHeaders(actor),
        payload: { durationMinutes: 0 },
      });
      expect(res.statusCode).toBe(422);
    });

    it("returns 404 for another workspace's service and for an unknown id", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const foreign = await createService(otherManager, baseService);
      const foreignId = foreign.json<Record<string, string>>()["id"];

      const crossWorkspace = await app.inject({
        method: "PATCH",
        url: `/v1/catalog/services/${foreignId}`,
        headers: await stateHeaders(actor),
        payload: { name: "Hijacked" },
      });
      const unknown = await app.inject({
        method: "PATCH",
        url: "/v1/catalog/services/11111111-1111-4111-8111-111111111111",
        headers: await stateHeaders(actor),
        payload: { name: "Hijacked" },
      });

      expect(crossWorkspace.statusCode).toBe(404);
      expect(unknown.statusCode).toBe(404);

      // The foreign row is untouched.
      const { rows } = await admin.query<{ name: string }>(
        `SELECT name FROM public.services WHERE id = $1`,
        [foreignId],
      );
      expect(rows[0]!.name).toBe("Cut & finish");
    });

    it("rejects a caller without catalog:manage with 403", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const created = await createService(actor, baseService);
      const id = created.json<Record<string, string>>()["id"];

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/catalog/services/${id}`,
        headers: await stateHeaders(reader),
        payload: { name: "Nope" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("/v1/catalog/categories", () => {
    it("creates, lists in deterministic sort order, and never leaks another workspace's categories", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      await app.inject({
        method: "POST",
        url: "/v1/catalog/categories",
        headers: await stateHeaders(otherManager),
        payload: { name: "Foreign category", sortOrder: -50 },
      });

      for (const [name, sortOrder] of [
        ["Colour", 2],
        ["Cutting", 1],
        ["Aftercare", 2],
      ] as const) {
        const created = await app.inject({
          method: "POST",
          url: "/v1/catalog/categories",
          headers: await stateHeaders(actor),
          payload: { name, sortOrder },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({ name, sortOrder });
      }

      const list = await app.inject({
        method: "GET",
        url: "/v1/catalog/categories",
        headers: { cookie: actor.sessionCookie },
      });
      expect(list.statusCode).toBe(200);
      // sort_order first, then name as the documented tie-break.
      expect(list.json<{ items: { name: string }[] }>().items.map((i) => i.name)).toEqual([
        "Cutting",
        "Aftercare",
        "Colour",
      ]);
    });

    it("defaults sortOrder when omitted and rejects a blank name with 422", async () => {
      const actor = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
      const created = await app.inject({
        method: "POST",
        url: "/v1/catalog/categories",
        headers: await stateHeaders(actor),
        payload: { name: "Default order" },
      });
      expect(created.json<Record<string, unknown>>()["sortOrder"]).toBe(0);

      const blank = await app.inject({
        method: "POST",
        url: "/v1/catalog/categories",
        headers: await stateHeaders(actor),
        payload: { name: "   " },
      });
      expect(blank.statusCode).toBe(422);
    });

    it("enforces catalog:read on list and catalog:manage on create", async () => {
      const noCapability = await seedActor([]);
      const list = await app.inject({
        method: "GET",
        url: "/v1/catalog/categories",
        headers: { cookie: noCapability.sessionCookie },
      });
      expect(list.statusCode).toBe(403);

      const create = await app.inject({
        method: "POST",
        url: "/v1/catalog/categories",
        headers: await stateHeaders(reader),
        payload: { name: "Nope" },
      });
      expect(create.statusCode).toBe(403);
    });
  });
});
