import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../main.js";

/**
 * T019 bootstrap test. Uses Fastify's `inject()` (no real port bound — the
 * requirement that bootstrap be testable without a fixed production port)
 * and never touches a database: `/healthz` is liveness-only, and the
 * DatabaseModule's `Pool` is constructed lazily (no connection attempt
 * until a query runs), so a syntactically valid but unreachable
 * `DATABASE_URL` is enough to build the app.
 */
describe("API bootstrap (T019)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env["DATABASE_URL"] = "postgres://app:app@127.0.0.1:5999/slotnova_bootstrap_test";
    process.env["API_CORS_ALLOWED_ORIGINS"] = "https://app.slotnova.test";
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("boots and responds 200 to GET /healthz", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({ status: "ok", service: "api" });
  });

  it("generates a correlation/request id and returns it to the caller", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect((response.headers["x-request-id"] as string).length).toBeGreaterThan(0);
  });

  it("preserves a trusted, supplied x-request-id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "client-supplied-id-123" },
    });
    expect(response.headers["x-request-id"]).toBe("client-supplied-id-123");
  });

  it("replaces an untrusted x-request-id with a freshly generated one", async () => {
    const untrusted = "not valid! <script>alert(1)</script>";
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": untrusted },
    });
    expect(response.headers["x-request-id"]).not.toBe(untrusted);
  });

  it("sets baseline security headers", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["strict-transport-security"]).toEqual(expect.any(String));
    expect(response.headers["content-security-policy"]).toEqual(expect.any(String));
  });

  it("returns a problem+json body for an unknown route", async () => {
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    const body = JSON.parse(response.payload) as { type: string; instance: string };
    expect(body.type).toBe("https://slotnova.app/problems/not-found");
    expect(body.instance).toMatch(/^https:\/\/slotnova\.app\/requests\//);
  });

  it("blocks a cross-origin request from an origin outside the allowlist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://evil.example" },
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows a cross-origin request from an allowlisted origin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://app.slotnova.test" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.slotnova.test");
  });
});
