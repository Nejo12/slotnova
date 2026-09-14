/**
 * T067 -- contract tests for `GET /v1/me`
 * (`contracts/workspace-context.contract.md`): success-path schema
 * validation against the real Zod response schema (`meResponseSchema`,
 * single source of truth per T064/ADR-013 -- the same schema object
 * `@ZodResponse` was decorated with) + problem+json validation for the
 * endpoint's one documented failure mode. Reuses the same real-PostgreSQL
 * app-boot/session-issuing infrastructure as
 * `session-and-me.int.test.ts`/`workspace-context.int.test.ts`.
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
import { sessionCookieName } from "../../application/session/session-cookie.js";
import { SessionService } from "../../application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../domain/ids.js";
import { SessionsRepository } from "../../infrastructure/repositories/sessions.repository.js";
import { meResponseSchema } from "../me.schema.js";

describe("GET /v1/me contract (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let app: NestFastifyApplication;
  let pool: Pool;
  let sessions: SessionService;

  const security = resolveSecurityConfig(process.env);
  const SESSION_COOKIE = sessionCookieName(security.secureCookies);

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();

    pool = new Pool({ connectionString: harness.appUri });
    sessions = new SessionService(new SessionsRepository(pool));
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
    await admin.end();
    await harness.stop();
  });

  it("success: body validates against meResponseSchema, with and without an active workspace", async () => {
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Me Contract WS', 'me-contract-ws') RETURNING id`,
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status) VALUES ('me-contract@example.test', 'Me Contract', 'active') RETURNING id`,
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions) VALUES ($1, $2, 'owner', ARRAY['members:invite'])`,
      [workspace.rows[0]!.id, user.rows[0]!.id],
    );

    const withWorkspace = await sessions.issue({
      userId: user.rows[0]!.id as UserId,
      activeWorkspaceId: workspace.rows[0]!.id as WorkspaceId,
    });
    const withWorkspaceRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `${SESSION_COOKIE}=${withWorkspace.rawToken}` },
    });
    expect(withWorkspaceRes.statusCode).toBe(200);
    meResponseSchema.parse(withWorkspaceRes.json());

    const noWorkspaceUser = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status) VALUES ('me-contract-no-ws@example.test', 'Me Contract No WS', 'active') RETURNING id`,
    );
    const withoutWorkspace = await sessions.issue({
      userId: noWorkspaceUser.rows[0]!.id as UserId,
      activeWorkspaceId: null,
    });
    const withoutWorkspaceRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `${SESSION_COOKIE}=${withoutWorkspace.rawToken}` },
    });
    expect(withoutWorkspaceRes.statusCode).toBe(200);
    meResponseSchema.parse(withoutWorkspaceRes.json());
  });

  it("failure: no session cookie -> 401 problem+json session-invalid", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/me" });
    expectProblemJson(response, { status: 401, slug: "session-invalid" });
    // Second assertion (PR-15 review fix): proves this response also
    // matches the GENERATED OpenAPI contract, not just the hand-written
    // helper above -- see `expect-problem-json.ts`'s doc comment.
    expectGeneratedProblemResponse(response, { path: "/v1/me", method: "get", status: 401 });
  });

  it("failure: garbage session cookie -> 401 problem+json session-invalid", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` },
    });
    expectProblemJson(response, { status: 401, slug: "session-invalid" });
    expectGeneratedProblemResponse(response, { path: "/v1/me", method: "get", status: 401 });
  });
});
