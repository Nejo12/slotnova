/**
 * T067 -- contract tests for `POST /v1/auth/session/workspace`
 * (`contracts/workspace-context.contract.md`): success-path schema
 * validation against `meResponseSchema` (the switch response is documented
 * as "same shape as `GET /v1/me`") + problem+json validation for every
 * documented failure mode (malformed body / non-UUID -> 400 validation,
 * no session -> 401 session-invalid, non-member target -> 403 not-a-member,
 * suspended workspace/membership -> 409 workspace-unavailable). Reuses the
 * same real-PostgreSQL app-boot/seeding infrastructure as
 * `workspace-context.int.test.ts`.
 */
import { Client, Pool, runMigrations } from "@slotnova/db";
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
import { sessionCookieName } from "../../application/session/session-cookie.js";
import { SessionService } from "../../application/session/session.service.js";
import type { UserId } from "../../domain/ids.js";
import { SessionsRepository } from "../../infrastructure/repositories/sessions.repository.js";
import { meResponseSchema } from "../me.schema.js";

describe("POST /v1/auth/session/workspace contract (real PostgreSQL)", () => {
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

  async function switchWorkspace(sessionCookie: string, workspaceId: unknown) {
    const { cookieHeader, token } = await getCsrfToken();
    return app.inject({
      method: "POST",
      url: "/v1/auth/session/workspace",
      headers: { cookie: `${sessionCookie}; ${cookieHeader}`, "x-csrf-token": token },
      payload: { workspaceId },
    });
  }

  async function seedWorkspaceMembership(
    role: string,
    membershipStatus: "active" | "suspended" = "active",
    workspaceStatus: "active" | "suspended" = "active",
  ): Promise<{ userId: string; workspaceId: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, status) VALUES ($1, $2, $3) RETURNING id`,
      [`Switch Contract WS ${suffix}`, `switch-contract-ws-${suffix}`, workspaceStatus],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status) VALUES ($1, 'Switch Contract User', 'active') RETURNING id`,
      [`switch-contract-${suffix}@example.test`],
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

  it("success: switch body validates against meResponseSchema", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const response = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expect(response.statusCode).toBe(200);
    meResponseSchema.parse(response.json());
  });

  it("failure: malformed body -> 400 problem+json validation", async () => {
    const { userId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const response = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, { not: "a string" });
    expectProblemJson(response, { status: 400, slug: "validation" });
    // Second assertion (PR-15 review fix): proves this response also
    // matches the GENERATED OpenAPI contract, not just the hand-written
    // helper above -- see `expect-problem-json.ts`'s doc comment.
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session/workspace",
      method: "post",
      status: 400,
    });
  });

  it("failure: non-UUID workspaceId -> 400 problem+json validation", async () => {
    const { userId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const response = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, "not-a-uuid");
    expectProblemJson(response, { status: 400, slug: "validation" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session/workspace",
      method: "post",
      status: 400,
    });
  });

  it("failure: no session cookie -> 401 problem+json session-invalid", async () => {
    const { cookieHeader, token } = await getCsrfToken();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/session/workspace",
      headers: { cookie: cookieHeader, "x-csrf-token": token },
      payload: { workspaceId: "11111111-1111-4111-8111-111111111111" },
    });
    expectProblemJson(response, { status: 401, slug: "session-invalid" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session/workspace",
      method: "post",
      status: 401,
    });
  });

  it("failure: non-member target -> 403 problem+json not-a-member", async () => {
    const { userId } = await seedWorkspaceMembership("owner");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const response = await switchWorkspace(
      `${SESSION_COOKIE}=${rawToken}`,
      "00000000-0000-4000-8000-000000000000",
    );
    expectProblemJson(response, { status: 403, slug: "not-a-member" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session/workspace",
      method: "post",
      status: 403,
    });
  });

  it("failure: suspended workspace -> 409 problem+json workspace-unavailable", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner", "active", "suspended");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const response = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expectProblemJson(response, { status: 409, slug: "workspace-unavailable" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session/workspace",
      method: "post",
      status: 409,
    });
  });

  it("failure: suspended membership -> 409 problem+json workspace-unavailable", async () => {
    const { userId, workspaceId } = await seedWorkspaceMembership("owner", "suspended", "active");
    const { rawToken } = await directSessionService.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    const response = await switchWorkspace(`${SESSION_COOKIE}=${rawToken}`, workspaceId);
    expectProblemJson(response, { status: 409, slug: "workspace-unavailable" });
    expectGeneratedProblemResponse(response, {
      path: "/v1/auth/session/workspace",
      method: "post",
      status: 409,
    });
  });
});
