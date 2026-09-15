import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, runMigrations } from "@slotnova/db";
import { startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "../../../../main.js";

describe("security boundary against real PostgreSQL", () => {
  let pg: PostgresHarness;
  let app: NestFastifyApplication;
  let admin: Client;
  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations({ connectionString: pg.adminUri });
    admin = new Client({ connectionString: pg.adminUri });
    await admin.connect();
    Object.assign(process.env, {
      SLOTNOVA_ENV: "preview",
      DATABASE_URL: pg.appUri,
      API_RATE_LIMIT_AUTH_MAX: "2",
      API_RATE_LIMIT_PREVIEW_MAX: "2",
      API_SECURE_COOKIES: "false",
      API_CORS_ALLOWED_ORIGINS: "http://localhost:3000",
    });
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await admin?.end();
    await pg?.stop();
  });
  function assertLimited(response: {
    statusCode: number;
    headers: Record<string, unknown>;
    payload: string;
  }) {
    expect(response.statusCode).toBe(429);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.headers["retry-after"]).toBeDefined();
    const body = JSON.parse(response.payload);
    expect(body).toMatchObject({ status: 429, title: "Too many requests." });
    expect(body.type).toMatch(/rate-limited$/);
    expect(body.instance).toBeTruthy();
    expect(body.requestId).toBeTruthy();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  }
  it("counts rejected credentials, ignores spoofed forwarded IPs and leaves CSRF enforced", async () => {
    const csrf = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const token = JSON.parse(csrf.payload).csrfToken;
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/session",
        headers: {
          cookie: `slotnova_csrf=${token}`,
          "x-csrf-token": token,
          origin: "http://localhost:3000",
          "x-forwarded-for": `192.0.2.${i + 1}`,
        },
        payload: { credential: { seededUserEmail: "missing@example.test" } },
      });
      if (i < 2) expect(response.statusCode).toBe(401);
      else {
        assertLimited(response);
        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
      }
    }
    const missingCsrf = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      payload: { credential: {} },
    });
    expect(missingCsrf.statusCode).toBe(403);
    expect((await admin.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n).toBe(0);
  });
  it("limits safe invitation reads without writing domain, audit or outbox state", async () => {
    const counts = async () =>
      (
        await admin.query(
          "SELECT (SELECT count(*) FROM invitations)::int AS invitations, (SELECT count(*) FROM outbox_records)::int AS outbox, (SELECT count(*) FROM audit_records)::int AS audit",
        )
      ).rows[0];
    const before = await counts();
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({ method: "GET", url: "/v1/invitations/unknown-token" });
      if (i < 2) expect(response.statusCode).toBe(404);
      else assertLimited(response);
    }
    expect(await counts()).toEqual(before);
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
  });
  it("keeps CSP/frame/referrer controls and denies unlisted credentialed origins", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://untrusted.example.test" },
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});
