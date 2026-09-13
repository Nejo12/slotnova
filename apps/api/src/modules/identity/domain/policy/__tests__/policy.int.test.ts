/**
 * T043 -- CapabilityGuard proven end-to-end against real PostgreSQL session
 * + membership data. No production controller declares `@RequireCapability`
 * yet (Phase 1's only capability-gated action, invitation issuance, is
 * T045/PR-10 -- out of scope here), so this test drives the guard directly
 * through Nest's own `CanActivate` contract against a test-only decorated
 * class, the same shape any future controller will use.
 */
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../../config/security-config.js";
import { sessionCookieName } from "../../../application/session/session-cookie.js";
import { SessionContextService } from "../../../application/session/session-context.service.js";
import { SessionService } from "../../../application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../ids.js";
import { MembershipsRepository } from "../../../infrastructure/repositories/memberships.repository.js";
import { SessionsRepository } from "../../../infrastructure/repositories/sessions.repository.js";
import { UsersRepository } from "../../../infrastructure/repositories/users.repository.js";
import { CapabilityGuard } from "../capability.guard.js";
import { MEMBERS_INVITE } from "../capabilities.js";
import { RequireCapability } from "../require-capability.decorator.js";

class ProtectedTestTarget {
  @RequireCapability(MEMBERS_INVITE)
  gatedAction(): void {
    /* no-op: only the decorator metadata matters */
  }

  ungatedAction(): void {
    /* declares no @RequireCapability -- guard must pass through */
  }
}

function fakeContext(
  request: Partial<FastifyRequest> & { cookies: Record<string, string | undefined> },
  handler: (...args: unknown[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ProtectedTestTarget,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe("CapabilityGuard (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let guard: CanActivate;
  const target = new ProtectedTestTarget();
  const security = resolveSecurityConfig(process.env);
  const SESSION_COOKIE = sessionCookieName(security.secureCookies);

  async function seedActiveMembership(permissions: readonly string[]): Promise<{
    rawToken: string;
    workspaceId: string;
    membershipId: string;
  }> {
    const suffix = Math.random().toString(36).slice(2, 10);
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Guard WS ${suffix}`, `guard-ws-${suffix}`],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ($1, 'Guard User') RETURNING id`,
      [`guard-${suffix}@example.test`],
    );
    const membership = await admin.query<{ id: string }>(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions)
       VALUES ($1, $2, 'staff', $3) RETURNING id`,
      [workspace.rows[0]!.id, user.rows[0]!.id, permissions],
    );

    const sessionService = new SessionService(new SessionsRepository(pool));
    const { rawToken } = await sessionService.issue({
      userId: user.rows[0]!.id as UserId,
      activeWorkspaceId: workspace.rows[0]!.id as WorkspaceId,
    });

    return {
      rawToken,
      workspaceId: workspace.rows[0]!.id,
      membershipId: membership.rows[0]!.id,
    };
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });

    guard = new CapabilityGuard(
      new Reflector(),
      new SessionService(new SessionsRepository(pool)),
      new SessionContextService(new UsersRepository(pool), new MembershipsRepository(pool)),
      security,
    );
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("allows through a route with no @RequireCapability metadata regardless of session state", async () => {
    const context = fakeContext({ cookies: {} }, target.ungatedAction);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("allows when the active membership's permissions include the required capability", async () => {
    const { rawToken } = await seedActiveMembership([MEMBERS_INVITE]);
    const context = fakeContext({ cookies: { [SESSION_COOKIE]: rawToken } }, target.gatedAction);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("denies with 403 forbidden + requiredCapability when the capability is missing", async () => {
    const { rawToken } = await seedActiveMembership([]);
    const context = fakeContext({ cookies: { [SESSION_COOKIE]: rawToken } }, target.gatedAction);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      slug: "forbidden",
      problemOptions: { requiredCapability: MEMBERS_INVITE },
    });
  });

  it("ignores a forged provider-role / permission claim on the request -- only DB-backed membership decides", async () => {
    const { rawToken } = await seedActiveMembership([]);
    const context = fakeContext(
      {
        cookies: { [SESSION_COOKIE]: rawToken },
        headers: { "x-debug-claimed-role": "owner" },
        body: { permissions: [MEMBERS_INVITE], role: "owner" },
      } as unknown as Partial<FastifyRequest> & { cookies: Record<string, string | undefined> },
      target.gatedAction,
    );
    await expect(guard.canActivate(context)).rejects.toMatchObject({ slug: "forbidden" });
  });

  it("denies with session-invalid when the active membership is suspended (inactive context cannot authorize)", async () => {
    const { rawToken, membershipId } = await seedActiveMembership([MEMBERS_INVITE]);
    await admin.query(`UPDATE public.memberships SET status = 'suspended' WHERE id = $1`, [
      membershipId,
    ]);
    const context = fakeContext({ cookies: { [SESSION_COOKIE]: rawToken } }, target.gatedAction);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ slug: "session-invalid" });
  });

  it("denies with session-invalid when the active workspace is suspended (inactive context cannot authorize)", async () => {
    const { rawToken, workspaceId } = await seedActiveMembership([MEMBERS_INVITE]);
    await admin.query(`UPDATE public.workspaces SET status = 'suspended' WHERE id = $1`, [
      workspaceId,
    ]);
    const context = fakeContext({ cookies: { [SESSION_COOKIE]: rawToken } }, target.gatedAction);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ slug: "session-invalid" });
  });

  it("denies with session-invalid when there is no session cookie", async () => {
    const context = fakeContext({ cookies: {} }, target.gatedAction);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ slug: "session-invalid" });
  });

  it("is deterministic: repeated calls against the same unchanged state return the same outcome", async () => {
    const { rawToken } = await seedActiveMembership([MEMBERS_INVITE]);
    const context = fakeContext({ cookies: { [SESSION_COOKIE]: rawToken } }, target.gatedAction);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
