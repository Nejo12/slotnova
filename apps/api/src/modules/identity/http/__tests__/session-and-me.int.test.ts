import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import { createApp } from "../../../../main.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { sessionCookieName } from "../../application/session/session-cookie.js";

/**
 * T038 -- `POST|DELETE /v1/auth/session`, `GET /v1/me` against real
 * PostgreSQL, exercised through the full Nest+Fastify app boot
 * (contracts/session.contract.md, contracts/workspace-context.contract.md).
 */
describe("session + /me endpoints (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;

  const security = resolveSecurityConfig(process.env);
  const SESSION_COOKIE = sessionCookieName(security.secureCookies);
  const CSRF_COOKIE = csrfCookieName(security.secureCookies);

  async function getCsrfToken(): Promise<{ cookieHeader: string; token: string }> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const cookie = res.cookies.find((c) => c.name === CSRF_COOKIE);
    if (!cookie) throw new Error("CSRF bootstrap did not set a cookie");
    return { cookieHeader: `${cookie.name}=${cookie.value}`, token: cookie.value };
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    await admin.query(
      `INSERT INTO public.users (email, display_name, status) VALUES ('owner@example.test', 'Dev Owner', 'active')`,
    );
    await admin.query(
      `INSERT INTO public.users (email, display_name, status) VALUES ('staff@example.test', 'Dev Staff', 'active')`,
    );
    await admin.query(
      `INSERT INTO public.users (email, display_name, status) VALUES ('disabled@example.test', 'Disabled', 'disabled')`,
    );

    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  describe("POST /v1/auth/session", () => {
    it("rejects with 403 when the CSRF token is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        payload: { credential: { seededUserEmail: "owner@example.test" } },
      });
      expect(res.statusCode).toBe(403);
      expect(res.headers["content-type"]).toContain("application/problem+json");
    });

    it("rejects with 400 problem+json on a malformed body, even with a valid CSRF token", async () => {
      const { cookieHeader, token } = await getCsrfToken();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: { cookie: cookieHeader, "x-csrf-token": token },
        payload: { nonsense: true },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain("/problems/validation");
    });

    it("rejects an unrecognized credential with a generic 401 (no user-enumeration)", async () => {
      const { cookieHeader, token } = await getCsrfToken();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: { cookie: cookieHeader, "x-csrf-token": token },
        payload: { credential: { seededUserEmail: "nobody-seeded@example.test" } },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().type).toContain("/problems/invalid-credentials");
    });

    it("rejects a disabled user with 403 user-disabled", async () => {
      const { cookieHeader, token } = await getCsrfToken();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: { cookie: cookieHeader, "x-csrf-token": token },
        payload: { credential: { seededUserEmail: "disabled@example.test" } },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toContain("/problems/user-disabled");
    });

    it("signs in via the dev adapter, sets a rotated session cookie, and auto-selects a sole workspace", async () => {
      const workspace = await admin.query<{ id: string }>(
        `INSERT INTO public.workspaces (name, slug) VALUES ('Solo Workspace', 'solo-ws') RETURNING id`,
      );
      const user = await admin.query<{ id: string }>(
        `SELECT id FROM public.users WHERE email = 'staff@example.test'`,
      );
      await admin.query(
        `INSERT INTO public.memberships (workspace_id, user_id, role, permissions) VALUES ($1, $2, 'owner', ARRAY['members:invite'])`,
        [workspace.rows[0]!.id, user.rows[0]!.id],
      );

      const { cookieHeader, token } = await getCsrfToken();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: { cookie: cookieHeader, "x-csrf-token": token },
        payload: { credential: { seededUserEmail: "staff@example.test" } },
      });

      expect(res.statusCode).toBe(200);
      const sessionCookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
      expect(sessionCookie).toBeDefined();

      const body = res.json();
      expect(body.user.email).toEqual("staff@example.test");
      expect(body.activeWorkspace).toMatchObject({ id: workspace.rows[0]!.id, role: "owner" });
      expect(body.workspaces).toHaveLength(1);
    });

    it("auto-selects null activeWorkspace when the user has more than one active membership", async () => {
      const wsOne = await admin.query<{ id: string }>(
        `INSERT INTO public.workspaces (name, slug) VALUES ('Multi WS One', 'multi-ws-one') RETURNING id`,
      );
      const wsTwo = await admin.query<{ id: string }>(
        `INSERT INTO public.workspaces (name, slug) VALUES ('Multi WS Two', 'multi-ws-two') RETURNING id`,
      );
      const user = await admin.query<{ id: string }>(
        `SELECT id FROM public.users WHERE email = 'owner@example.test'`,
      );
      await admin.query(
        `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [wsOne.rows[0]!.id, user.rows[0]!.id],
      );
      await admin.query(
        `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`,
        [wsTwo.rows[0]!.id, user.rows[0]!.id],
      );

      const { cookieHeader, token } = await getCsrfToken();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: { cookie: cookieHeader, "x-csrf-token": token },
        payload: { credential: { seededUserEmail: "owner@example.test" } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.activeWorkspace).toBeNull();
      expect(body.workspaces).toHaveLength(2);
    });
  });

  describe("GET /v1/me and DELETE /v1/auth/session", () => {
    it("GET /v1/me is 401 session-invalid with no session cookie", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/me" });
      expect(res.statusCode).toBe(401);
      expect(res.json().type).toContain("/problems/session-invalid");
    });

    it("full lifecycle: sign in, GET /me reflects context, sign out revokes, old cookie unusable, sign-out idempotent", async () => {
      const { cookieHeader: csrfCookie1, token: csrfToken1 } = await getCsrfToken();
      const signIn = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: { cookie: csrfCookie1, "x-csrf-token": csrfToken1 },
        payload: { credential: { seededUserEmail: "staff@example.test" } },
      });
      expect(signIn.statusCode).toBe(200);
      const sessionCookie = signIn.cookies.find((c) => c.name === SESSION_COOKIE)!;

      const me = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `${sessionCookie.name}=${sessionCookie.value}` },
      });
      expect(me.statusCode).toBe(200);
      const meBody = me.json();
      expect(meBody.user.email).toEqual("staff@example.test");
      expect(meBody.session.expiresAt).toBeTruthy();
      if (meBody.activeWorkspace) {
        expect(meBody.activeWorkspace.permissions).toBeInstanceOf(Array);
      }

      // Sign out requires CSRF too, and a fresh bootstrap CSRF token/cookie
      // works independently of the session cookie.
      const { cookieHeader: csrfCookie2, token: csrfToken2 } = await getCsrfToken();
      const signOut = await app.inject({
        method: "DELETE",
        url: "/v1/auth/session",
        headers: {
          cookie: `${sessionCookie.name}=${sessionCookie.value}; ${csrfCookie2}`,
          "x-csrf-token": csrfToken2,
        },
      });
      expect(signOut.statusCode).toBe(204);

      // Old cookie must not become usable again.
      const meAfterSignOut = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `${sessionCookie.name}=${sessionCookie.value}` },
      });
      expect(meAfterSignOut.statusCode).toBe(401);

      // Idempotent sign-out (already-invalid session) is still 204.
      const { cookieHeader: csrfCookie3, token: csrfToken3 } = await getCsrfToken();
      const signOutAgain = await app.inject({
        method: "DELETE",
        url: "/v1/auth/session",
        headers: {
          cookie: `${sessionCookie.name}=${sessionCookie.value}; ${csrfCookie3}`,
          "x-csrf-token": csrfToken3,
        },
      });
      expect(signOutAgain.statusCode).toBe(204);
    });

    it("DELETE /v1/auth/session without CSRF is 403", async () => {
      const res = await app.inject({ method: "DELETE", url: "/v1/auth/session" });
      expect(res.statusCode).toBe(403);
    });
  });
});
