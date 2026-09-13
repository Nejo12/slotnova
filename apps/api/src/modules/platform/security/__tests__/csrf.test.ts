import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CSRF_HEADER_NAME,
  csrfCookieName,
  issueCsrfCookie,
  registerCsrfProtection,
} from "../csrf.js";

const ALLOWED_ORIGIN = "https://app.slotnova.test";

async function buildTestApp(secureCookies = false): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyCookie);
  registerCsrfProtection(app, { allowedOrigins: [ALLOWED_ORIGIN], secureCookies });

  app.get("/bootstrap", (_request, reply) => {
    const token = issueCsrfCookie(reply, { allowedOrigins: [ALLOWED_ORIGIN], secureCookies });
    return { csrfToken: token };
  });
  app.post("/state-changing", () => ({ ok: true }));
  await app.ready();
  return app;
}

/**
 * T037 -- CSRF protection: double-submit cookie + Origin/Sec-Fetch-Site
 * verification (research R6). No database involved, so this runs in the fast
 * lane against a bare Fastify instance with the same hook `main.ts` wires.
 */
describe("CSRF protection", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("exempts safe methods (GET/HEAD/OPTIONS) with no token required", async () => {
    const res = await app.inject({ method: "GET", url: "/bootstrap" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a state-changing request with no CSRF token at all", async () => {
    const res = await app.inject({ method: "POST", url: "/state-changing" });
    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json();
    expect(body.type).toContain("/problems/forbidden");
    expect(body.status).toBe(403);
  });

  it("rejects a state-changing request with a mismatched token", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/bootstrap" });
    const setCookie = bootstrap.cookies.find((c) => c.name === csrfCookieName(false));
    expect(setCookie).toBeDefined();

    const res = await app.inject({
      method: "POST",
      url: "/state-changing",
      headers: {
        cookie: `${setCookie!.name}=${setCookie!.value}`,
        [CSRF_HEADER_NAME]: "a-completely-different-token",
        origin: ALLOWED_ORIGIN,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("accepts a state-changing request with a valid matching token from an allowed origin", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/bootstrap" });
    const setCookie = bootstrap.cookies.find((c) => c.name === csrfCookieName(false));
    const token = bootstrap.json().csrfToken as string;
    expect(setCookie!.value).toEqual(token);

    const res = await app.inject({
      method: "POST",
      url: "/state-changing",
      headers: {
        cookie: `${setCookie!.name}=${setCookie!.value}`,
        [CSRF_HEADER_NAME]: token,
        origin: ALLOWED_ORIGIN,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a cross-site Origin even with a matching double-submit token", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/bootstrap" });
    const setCookie = bootstrap.cookies.find((c) => c.name === csrfCookieName(false));
    const token = bootstrap.json().csrfToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/state-changing",
      headers: {
        cookie: `${setCookie!.name}=${setCookie!.value}`,
        [CSRF_HEADER_NAME]: token,
        origin: "https://evil.example",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a request whose Sec-Fetch-Site says cross-site, regardless of tokens", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/bootstrap" });
    const setCookie = bootstrap.cookies.find((c) => c.name === csrfCookieName(false));
    const token = bootstrap.json().csrfToken as string;

    const res = await app.inject({
      method: "POST",
      url: "/state-changing",
      headers: {
        cookie: `${setCookie!.name}=${setCookie!.value}`,
        [CSRF_HEADER_NAME]: token,
        origin: ALLOWED_ORIGIN,
        "sec-fetch-site": "cross-site",
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
