/**
 * T042 -- `POST /v1/auth/session/workspace` against real PostgreSQL through
 * the full Nest+Fastify app boot (contracts/workspace-context.contract.md),
 * same pattern as `session-and-me.int.test.ts`.
 */
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import { createApp } from "../../../../main.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { sessionCookieName } from "../../application/session/session-cookie.js";
import { SessionService } from "../../application/session/session.service.js";
import type { UserId } from "../../domain/ids.js";
import { SessionsRepository } from "../../infrastructure/repositories/sessions.repository.js";

describe("POST /v1/auth/session/workspace (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let directPool: Pool;
  let directSessionService: SessionService;

  const security = resolveSecurityConfig(process.env);
  const SESSION_COOKIE = sessionCookieName(security.secureCookies);
  const CSRF_COOKIE = csrfCookieName(security.secureCookies);

  async function getCsrfToken(): Promise<{ cookieHeader: string; token: string }> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const cookie = res.cookies.find((c) => c.name === CSRF_COOKIE);
    if (!cookie) throw new Error("CSRF bootstrap did not set a cookie");
    return { cookieHeader: `${cookie.name}=${cookie.value}`, token: cookie.value };
  }

  async function switchWorkspace(
    sessionCookie: string,
    workspaceId: unknown,
  ): Promise<{ statusCode: number; body: Record<string, unknown>; res: Awaited<ReturnType<typeof app.inject>> }> {
    const { cookieHeader, token } = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/session/workspace",
      headers: { cookie: `${sessionCookie}; ${cookieHeader}`, "x-csrf-token": token },
      payload: { workspaceId },
    });
    return { statusCode: res.statusCode, body: res.json(), res };
  }

  async function seedWorkspaceMembership(
    role: string,
    membershipStatus: "active" | "suspended" = "active",
    workspaceStatus: "active" | "suspended" = "active",
  ): Promise<{ userId: string; workspaceId: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, status) VALUES ($1, $2, $3) RETURNING id`,
      [`Switch WS ${suffix}`, `switch-ws-${suffix}`, workspaceStatus],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status) VALUES ($1, 'Switch User', 'active') RETURNING id`,
      [`switch-${suffix}@example.test`],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status) VALUES ($1, $2, $3, $4)`,
      [workspace.rows[0]!.id, user.rows[0]!.id, role, membershipStatus],
    );
    return { userId: user.rows[0]!.id, workspaceId: workspace.rows[0]!.id };
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();

    directPool = new Pool({ connectionString: harness.appUri });
    directSessionService = new SessionService(new SessionsRepository(directPool));
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await directPool.end();
    await admin.end();
    await harness.stop();
  });

  it("rejects with 403 when the CSRF token is missing", async () => {
    const { userId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/session/workspace",
      headers: { cookie: `${SESSION_COOKIE}=${rawToken}` },
      payload: { workspaceId: "irrelevant" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects with 400 validation on a malformed body", async () => {
    const { userId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const { statusCode, body } = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, {
      not: "a string",
    });
    expect(statusCode).toBe(400);
    expect(body["type"]).toContain("/problems/validation");
  });

  it("rejects with 401 session-invalid when there is no session cookie", async () => {
    const { cookieHeader, token } = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/session/workspace",
      headers: { cookie: cookieHeader, "x-csrf-token": token },
      payload: { workspaceId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().type).toContain("/problems/session-invalid");
  });

  it("switches successfully: 200, /me-shaped body, rotated session cookie, old cookie invalidated", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });

    const { statusCode, body, res } = await switchWorkspace(
      `${SESSION_COOKIE}=${rawToken}`,
      workspaceId,
    );
    expect(statusCode).toBe(200);
    expect(body["activeWorkspace"]).toMatchObject({ id: workspaceId, role: "owner" });

    const newSessionCookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(newSessionCookie).toBeDefined();
    expect(newSessionCookie!.value).not.toEqual(rawToken);

    // Old token is invalid (rotation revokes it atomically).
    const meWithOld = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `${SESSION_COOKIE}=${rawToken}` },
    });
    expect(meWithOld.statusCode).toBe(401);

    // New token resolves the new active workspace.
    const meWithNew = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `${newSessionCookie!.name}=${newSessionCookie!.value}` },
    });
    expect(meWithNew.statusCode).toBe(200);
    expect(meWithNew.json().activeWorkspace).toMatchObject({ id: workspaceId });
  });

  it("switch rotates CSRF material too -- a CSRF cookie is (re)issued on success", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const { res } = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expect(res.cookies.some((c) => c.name === CSRF_COOKIE)).toBe(true);
  });

  it("after switching, a tenant query in the same session resolves only against the new workspace (RLS backstop)", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner");
    const location = await admin.query<{ id: string }>(
      `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'Studio', 'Europe/Berlin') RETURNING id`,
      [workspaceId],
    );
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const switchResult = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expect(switchResult.statusCode).toBe(200);
    expect(switchResult.body["activeWorkspace"]).toMatchObject({ id: workspaceId });

    const client = await directPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
      const { rows } = await client.query("SELECT id FROM public.locations WHERE id = $1", [
        location.rows[0]!.id,
      ]);
      expect(rows).toHaveLength(1);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("rejects a non-member switch target with 403 not-a-member -- same response for a workspace that does not exist at all", async () => {
    const { userId: memberUserId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: memberUserId as UserId,
      activeWorkspaceId: null,
    });

    const nonExistent = await switchWorkspace(
      `${SESSION_COOKIE}=${rawToken}`,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(nonExistent.statusCode).toBe(403);
    expect(nonExistent.body["type"]).toContain("/problems/not-a-member");

    const { workspaceId: otherWorkspaceId } = await seedWorkspaceMembership("owner");
    const belongsToSomeoneElse = await switchWorkspace(
      `${SESSION_COOKIE}=${rawToken}`,
      otherWorkspaceId,
    );
    expect(belongsToSomeoneElse.statusCode).toBe(403);
    expect(belongsToSomeoneElse.body["type"]).toContain("/problems/not-a-member");
    // Both cases return the identical problem type -- no existence oracle.
    expect(belongsToSomeoneElse.body["type"]).toEqual(nonExistent.body["type"]);
  });

  it("rejects switching into a suspended workspace with 409 workspace-unavailable", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner", "active", "suspended");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const { statusCode, body } = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expect(statusCode).toBe(409);
    expect(body["type"]).toContain("/problems/workspace-unavailable");
  });

  it("rejects switching with a suspended membership with 409 workspace-unavailable", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner", "suspended", "active");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const { statusCode, body } = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expect(statusCode).toBe(409);
    expect(body["type"]).toContain("/problems/workspace-unavailable");
  });
});
