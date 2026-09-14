/**
 * T067 -- contract tests for `POST|DELETE /v1/auth/session`
 * (`contracts/session.contract.md`): success-path schema validation against
 * the real Zod response schema (`signInResponseSchema`) + problem+json
 * validation for every documented failure mode (missing CSRF -> 403,
 * malformed body -> 400 validation, unknown credential -> 401
 * invalid-credentials, disabled user -> 403 user-disabled). Reuses the same
 * real-PostgreSQL app-boot/CSRF-bootstrap infrastructure as
 * `session-and-me.int.test.ts`.
 *
 * Sign-in goes through the dev credential adapter, which only recognizes
 * `DEFAULT_SEEDED_USERS`' fixed emails (not arbitrary DB rows) -- same
 * constraint `session-and-me.int.test.ts` documents -- so this file seeds
 * exactly those emails rather than uniquely-generated ones.
 */
import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import {
  expectGeneratedProblemResponse,
  expectProblemJson,
} from "../../../../http/problem/__tests__/expect-problem-json.js";
import { createApp } from "../../../../main.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { signInResponseSchema } from "../session.schema.js";

describe("session sign-in/sign-out contract (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;

  const security = resolveSecurityConfig(process.env);
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

    // Dev adapter only recognizes DEFAULT_SEEDED_USERS' fixed emails.
    await admin.query(
      `INSERT INTO public.users (email, display_name, status) VALUES ('owner@example.test', 'Dev Owner', 'active')`,
    );
    await admin.query(
      `INSERT INTO public.users (email, display_name, status) VALUES ('disabled@example.test', 'Dev Disabled User', 'disabled')`,
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

  it("success: sign-in body validates against signInResponseSchema", async () => {
    const { cookieHeader, token } = await getCsrfToken();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      headers: { cookie: cookieHeader, "x-csrf-token": token },
      payload: { credential: { seededUserEmail: "owner@example.test" } },
    });
    expect(response.statusCode).toBe(200);
    signInResponseSchema.parse(response.json());
  });

  it("failure: missing CSRF token -> 403 problem+json forbidden", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      payload: { credential: { seededUserEmail: "owner@example.test" } },
    });
    // NOT paired with `expectGeneratedProblemResponse` here: CSRF rejection
    // comes from a raw Fastify `onRequest` hook that runs before Nest's
    // routing pipeline (`registerCsrfProtection`,
    // `../../platform/security/csrf.ts`), so there is no controller-method
    // metadata for `@nestjs/swagger` to have documented -- this 403 is real
    // runtime behavior (still asserted below) that is simply not part of the
    // generated OpenAPI document. See `session.controller.ts`'s file comment.
    expectProblemJson(response, { status: 403, slug: "forbidden" });
  });

  it("failure: malformed body -> 400 problem+json validation", async () => {
    const { cookieHeader, token } = await getCsrfToken();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      headers: { cookie: cookieHeader, "x-csrf-token": token },
      payload: { nonsense: true },
    });
    expectProblemJson(response, { status: 400, slug: "validation" });
    // Second assertion (PR-15 review fix): proves this response also
    // matches the GENERATED OpenAPI contract, not just the hand-written
    // helper above -- see `expect-problem-json.ts`'s doc comment.
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session",
      method: "post",
      status: 400,
    });
  });

  it("failure: unrecognized credential -> 401 problem+json invalid-credentials", async () => {
    const { cookieHeader, token } = await getCsrfToken();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      headers: { cookie: cookieHeader, "x-csrf-token": token },
      payload: { credential: { seededUserEmail: "nobody-contract-seeded@example.test" } },
    });
    expectProblemJson(response, { status: 401, slug: "invalid-credentials" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session",
      method: "post",
      status: 401,
    });
  });

  it("failure: disabled user -> 403 problem+json user-disabled", async () => {
    const { cookieHeader, token } = await getCsrfToken();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session",
      headers: { cookie: cookieHeader, "x-csrf-token": token },
      payload: { credential: { seededUserEmail: "disabled@example.test" } },
    });
    expectProblemJson(response, { status: 403, slug: "user-disabled" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session",
      method: "post",
      status: 403,
    });
  });

  it("failure: DELETE /v1/auth/session missing CSRF -> 403 problem+json forbidden", async () => {
    const response = await app.inject({ method: "DELETE", url: "/v1/auth/session" });
    // Same as the sign-in CSRF case above -- not documented in the generated
    // OpenAPI document (Fastify-hook-level, not controller-level).
    expectProblemJson(response, { status: 403, slug: "forbidden" });
  });
});
