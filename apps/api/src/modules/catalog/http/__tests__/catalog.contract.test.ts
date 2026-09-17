/**
 * Contract tests for `/v1/catalog/*` (PR-02, issue #60,
 * `contracts/catalog.contract.md`), mirroring the T067 pattern established
 * by `identity/http/__tests__/*.contract.test.ts`:
 *
 * 1. every success body is parsed with the SAME Zod schema object
 *    `@ZodResponse` published to the OpenAPI document — not a hand-written
 *    expectation of it;
 * 2. every documented failure is asserted to be valid `problem+json` AND to
 *    match what the committed generated document declares for that exact
 *    path/method/status (`expectGeneratedProblemResponse`);
 * 3. the generated document itself is asserted to contain exactly the six
 *    endpoints this PR is scoped to — no add-on, staff-capability or delete
 *    route may appear.
 *
 * `contracts:check` separately proves the committed document matches what
 * `openapi:generate` produces from current source, so asserting against the
 * committed artifact here is asserting against the real generated contract.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
import { sessionCookieName } from "../../../identity/application/session/session-cookie.js";
import { SessionService } from "../../../identity/application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../../identity/domain/ids.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { CATALOG_MANAGE, CATALOG_READ } from "../../domain/policy/capabilities.js";
import {
  serviceCategoryListResponseSchema,
  serviceCategoryResponseSchema,
  serviceListResponseSchema,
  serviceResponseSchema,
} from "../catalog.schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, "../../../../../openapi/openapi.json");

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
}

const security = resolveSecurityConfig(process.env);
const SESSION_COOKIE = sessionCookieName(security.secureCookies);
const CSRF_COOKIE = csrfCookieName(security.secureCookies);

describe("/v1/catalog contract", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let sessions: SessionService;

  let manager: { workspaceId: string; cookie: string };
  let readOnly: { workspaceId: string; cookie: string };

  let counter = 0;

  async function seedActor(
    permissions: readonly string[],
  ): Promise<{ workspaceId: string; cookie: string }> {
    const suffix = `${Date.now()}-${(counter += 1)}`;
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Catalog contract ${suffix}`, `catalog-contract-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status)
       VALUES ($1, 'Catalog Contract', 'active') RETURNING id`,
      [`catalog-contract-${suffix}@example.test`],
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
      cookie: `${SESSION_COOKIE}=${issued.rawToken}`,
    };
  }

  async function stateHeaders(cookie: string): Promise<Record<string, string>> {
    const res = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const csrf = res.cookies.find((c) => c.name === CSRF_COOKIE)!;
    return {
      cookie: `${cookie}; ${csrf.name}=${csrf.value}`,
      "x-csrf-token": csrf.value,
    };
  }

  const baseService = {
    name: "Contract service",
    durationMinutes: 30,
    priceAmountMinor: 3000,
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
    sessions = app.get(SessionService);

    manager = await seedActor([CATALOG_READ, CATALOG_MANAGE]);
    readOnly = await seedActor([CATALOG_READ]);
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await admin.end();
    await harness.stop();
  });

  it("publishes exactly the six PR-02 Catalog operations and no deferred surface", () => {
    const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8")) as OpenApiDocument;
    const catalogOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith("/v1/catalog"))
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

    expect(catalogOperations).toEqual([
      "GET /v1/catalog/categories",
      "GET /v1/catalog/services",
      "GET /v1/catalog/services/{id}",
      "PATCH /v1/catalog/services/{id}",
      "POST /v1/catalog/categories",
      "POST /v1/catalog/services",
    ]);
    // Founder-deferred (research.md R-ADDON / R-SCOPE): must not exist.
    expect(catalogOperations.join(" ")).not.toContain("add-ons");
    expect(catalogOperations.join(" ")).not.toContain("DELETE");
  });

  it("success bodies validate against the published response schemas", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: {
        ...(await stateHeaders(manager.cookie)),
        "idempotency-key": `c-${(counter += 1)}`,
      },
      payload: baseService,
    });
    expect(created.statusCode).toBe(201);
    const service = serviceResponseSchema.parse(created.json());

    const detail = await app.inject({
      method: "GET",
      url: `/v1/catalog/services/${service.id}`,
      headers: { cookie: manager.cookie },
    });
    expect(detail.statusCode).toBe(200);
    serviceResponseSchema.parse(detail.json());

    const list = await app.inject({
      method: "GET",
      url: "/v1/catalog/services",
      headers: { cookie: manager.cookie },
    });
    expect(list.statusCode).toBe(200);
    serviceListResponseSchema.parse(list.json());

    const patched = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/services/${service.id}`,
      headers: await stateHeaders(manager.cookie),
      payload: { active: false },
    });
    expect(patched.statusCode).toBe(200);
    serviceResponseSchema.parse(patched.json());

    const category = await app.inject({
      method: "POST",
      url: "/v1/catalog/categories",
      headers: await stateHeaders(manager.cookie),
      payload: { name: "Contract category" },
    });
    expect(category.statusCode).toBe(201);
    serviceCategoryResponseSchema.parse(category.json());

    const categories = await app.inject({
      method: "GET",
      url: "/v1/catalog/categories",
      headers: { cookie: manager.cookie },
    });
    expect(categories.statusCode).toBe(200);
    serviceCategoryListResponseSchema.parse(categories.json());
  });

  it("401 (no session) is documented problem+json on a read and a write", async () => {
    const read = await app.inject({ method: "GET", url: "/v1/catalog/services" });
    expectProblemJson(read, { status: 401, slug: "session-invalid" });
    expectGeneratedProblemResponse(read, {
      path: "/v1/catalog/services",
      method: "get",
      status: 401,
    });

    const write = await app.inject({
      method: "POST",
      url: "/v1/catalog/categories",
      headers: await stateHeaders(""),
      payload: { name: "Nope" },
    });
    expectProblemJson(write, { status: 401, slug: "session-invalid" });
    expectGeneratedProblemResponse(write, {
      path: "/v1/catalog/categories",
      method: "post",
      status: 401,
    });
  });

  it("403 (missing capability) is documented problem+json and names the capability", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: {
        ...(await stateHeaders(readOnly.cookie)),
        "idempotency-key": `f-${(counter += 1)}`,
      },
      payload: baseService,
    });
    expectProblemJson(res, { status: 403, slug: "forbidden" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/catalog/services",
      method: "post",
      status: 403,
    });
    expect(res.json<Record<string, unknown>>()["requiredCapability"]).toBe(CATALOG_MANAGE);
  });

  it("404 (unknown/foreign service) is documented problem+json", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/catalog/services/11111111-1111-4111-8111-111111111111",
      headers: { cookie: manager.cookie },
    });
    expectProblemJson(res, { status: 404, slug: "not-found" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/catalog/services/{id}",
      method: "get",
      status: 404,
    });
  });

  it("422 (domain invariant) is documented problem+json with a field path", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: {
        ...(await stateHeaders(manager.cookie)),
        "idempotency-key": `v-${(counter += 1)}`,
      },
      payload: { ...baseService, durationMinutes: 0 },
    });
    expectProblemJson(res, { status: 422, slug: "validation" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/catalog/services",
      method: "post",
      status: 422,
    });
    expect(res.json<{ errors: { path: string }[] }>().errors[0]!.path).toBe("durationMinutes");
  });

  it("400 (schema-level validation) is documented problem+json", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: {
        ...(await stateHeaders(manager.cookie)),
        "idempotency-key": `b-${(counter += 1)}`,
      },
      payload: { ...baseService, unexpected: true },
    });
    expectProblemJson(res, { status: 400, slug: "validation" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/catalog/services",
      method: "post",
      status: 400,
    });
  });

  it("409 (idempotency conflict) is documented problem+json and leaks no persistence detail", async () => {
    const key = `conflict-${(counter += 1)}`;
    const first = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: { ...(await stateHeaders(manager.cookie)), "idempotency-key": key },
      payload: baseService,
    });
    expect(first.statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: "/v1/catalog/services",
      headers: { ...(await stateHeaders(manager.cookie)), "idempotency-key": key },
      payload: { ...baseService, name: "Different" },
    });
    expectProblemJson(res, { status: 409, slug: "idempotency-conflict" });
    expectGeneratedProblemResponse(res, {
      path: "/v1/catalog/services",
      method: "post",
      status: 409,
    });
    const raw = res.payload.toLowerCase();
    for (const leak of ["idempotent_requests", "select", "insert", "sqlstate", "fingerprint"]) {
      expect(raw).not.toContain(leak);
    }
  });
});
