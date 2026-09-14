/**
 * T067 -- contract tests for `/v1/invitations*`
 * (`contracts/invitations.contract.md`): success-path schema validation
 * against the real Zod response schemas (`issueInvitationResponseSchema`,
 * `invitationPreviewResponseSchema`, and `meResponseSchema` for
 * acceptance -- documented as "same shape as `GET /v1/me`") + problem+json
 * validation for every documented failure mode across issue/preview/
 * acceptance/revoke. Reuses the same real-PostgreSQL app-boot/actor-seeding
 * infrastructure as `invitation.int.test.ts`.
 */
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import { expectProblemJson } from "../../../../http/problem/__tests__/expect-problem-json.js";
import { createApp } from "../../../../main.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { sessionCookieName } from "../../application/session/session-cookie.js";
import { SessionService } from "../../application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../domain/ids.js";
import { SessionsRepository } from "../../infrastructure/repositories/sessions.repository.js";
import {
  invitationPreviewResponseSchema,
  issueInvitationResponseSchema,
} from "../invitations.schema.js";
import { meResponseSchema } from "../me.schema.js";

interface Actor {
  userId: string;
  workspaceId: string;
  rawSession: string;
}

describe("invitations contract (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let app: NestFastifyApplication;
  let sessions: SessionService;
  let sequence = 0;

  const security = resolveSecurityConfig(process.env);
  const SESSION_COOKIE = sessionCookieName(security.secureCookies);
  const CSRF_COOKIE = csrfCookieName(security.secureCookies);

  const unique = (prefix: string) => `${prefix}-${Date.now()}-${sequence++}`;

  async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const cookie = response.cookies.find((item) => item.name === CSRF_COOKIE)!;
    return { cookie: `${cookie.name}=${cookie.value}`, token: cookie.value };
  }

  async function stateHeaders(rawSession: string) {
    const token = await csrf();
    return {
      cookie: `${SESSION_COOKIE}=${rawSession}; ${token.cookie}`,
      "x-csrf-token": token.token,
    };
  }

  async function createUser(email = `${unique("user")}@example.test`) {
    const result = await admin.query<{ id: string }>(
      "INSERT INTO public.users (email, display_name) VALUES ($1, 'Contract Invite User') RETURNING id",
      [email],
    );
    return { id: result.rows[0]!.id, email };
  }

  async function createActor(permissions = ["members:invite"]): Promise<Actor> {
    const suffix = unique("workspace");
    const workspace = await admin.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id",
      [`Contract Workspace ${suffix}`, suffix],
    );
    const user = await createUser(`${unique("actor")}@example.test`);
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions)
       VALUES ($1, $2, 'admin', $3)`,
      [workspace.rows[0]!.id, user.id, permissions],
    );
    const session = await sessions.issue({
      userId: user.id as UserId,
      activeWorkspaceId: workspace.rows[0]!.id as WorkspaceId,
    });
    return { userId: user.id, workspaceId: workspace.rows[0]!.id, rawSession: session.rawToken };
  }

  async function issue(actor: Actor, email: string, role = "manager") {
    return app.inject({
      method: "POST",
      url: "/v1/invitations",
      headers: await stateHeaders(actor.rawSession),
      payload: { email, role },
    });
  }

  async function issueValid(actor: Actor, email: string, role = "manager") {
    const response = await issue(actor, email, role);
    expect(response.statusCode).toBe(201);
    const body = response.json();
    return { response, body, id: body.invitation.id as string, token: body.token as string };
  }

  async function accept(rawSession: string, token: string) {
    return app.inject({
      method: "POST",
      url: `/v1/invitations/${token}/acceptance`,
      headers: await stateHeaders(rawSession),
    });
  }

  beforeAll(async () => {
    process.env["NODE_ENV"] = "test";
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });
    sessions = new SessionService(new SessionsRepository(pool));
    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
    await admin.end();
    await harness.stop();
  });

  describe("POST /v1/invitations (issue)", () => {
    it("success: body validates against issueInvitationResponseSchema", async () => {
      const actor = await createActor();
      const response = await issue(actor, `${unique("issue-success")}@example.test`, "staff");
      expect(response.statusCode).toBe(201);
      issueInvitationResponseSchema.parse(response.json());
    });

    it("failure: missing members:invite capability -> 403 problem+json forbidden", async () => {
      const denied = await createActor([]);
      const response = await issue(denied, `${unique("denied")}@example.test`);
      expectProblemJson(response, { status: 403, slug: "forbidden" });
      expect(response.json().requiredCapability).toBe("members:invite");
    });

    it("failure: role owner -> 400 problem+json validation", async () => {
      const actor = await createActor();
      const response = await issue(actor, `${unique("owner-role")}@example.test`, "owner");
      expectProblemJson(response, { status: 400, slug: "validation" });
    });

    it("failure: duplicate pending invitation -> 409 problem+json invitation-exists", async () => {
      const actor = await createActor();
      const email = `${unique("duplicate")}@example.test`;
      await issueValid(actor, email);
      const response = await issue(actor, email);
      expectProblemJson(response, { status: 409, slug: "invitation-exists" });
    });

    it("failure: already-active member -> 409 problem+json already-member", async () => {
      const actor = await createActor();
      const member = await createUser();
      await admin.query(
        "INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'staff')",
        [actor.workspaceId, member.id],
      );
      const response = await issue(actor, member.email);
      expectProblemJson(response, { status: 409, slug: "already-member" });
    });
  });

  describe("GET /v1/invitations/:token (preview)", () => {
    it("success: body validates against invitationPreviewResponseSchema", async () => {
      const actor = await createActor();
      const { token } = await issueValid(actor, `${unique("preview-success")}@example.test`);
      const response = await app.inject({ method: "GET", url: `/v1/invitations/${token}` });
      expect(response.statusCode).toBe(200);
      invitationPreviewResponseSchema.parse(response.json());
    });

    it("failure: garbage token -> 404 problem+json invitation-not-found", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/invitations/${unique("garbage-token")}`,
      });
      expectProblemJson(response, { status: 404, slug: "invitation-not-found" });
    });

    it("failure: revoked token -> 404 problem+json invitation-not-found (no distinction from unknown)", async () => {
      const actor = await createActor();
      const revoked = await issueValid(actor, `${unique("revoked-preview")}@example.test`);
      await admin.query("UPDATE public.invitations SET status = 'revoked' WHERE id = $1", [
        revoked.id,
      ]);
      const response = await app.inject({
        method: "GET",
        url: `/v1/invitations/${revoked.token}`,
      });
      expectProblemJson(response, { status: 404, slug: "invitation-not-found" });
    });

    it("failure: expired token -> 410 problem+json invitation-expired", async () => {
      const actor = await createActor();
      const expired = await issueValid(actor, `${unique("expired-preview")}@example.test`);
      await admin.query(
        "UPDATE public.invitations SET expires_at = now() - interval '1 second' WHERE id = $1",
        [expired.id],
      );
      const response = await app.inject({
        method: "GET",
        url: `/v1/invitations/${expired.token}`,
      });
      expectProblemJson(response, { status: 410, slug: "invitation-expired" });
    });

    it("failure: used (accepted) token -> 410 problem+json invitation-expired", async () => {
      const actor = await createActor();
      const used = await issueValid(actor, `${unique("used-preview")}@example.test`);
      await admin.query("UPDATE public.invitations SET status = 'accepted' WHERE id = $1", [
        used.id,
      ]);
      const response = await app.inject({ method: "GET", url: `/v1/invitations/${used.token}` });
      expectProblemJson(response, { status: 410, slug: "invitation-expired" });
    });

    it("failure: rate-limited after too many requests for the same token/IP -> 429 problem+json rate-limited", async () => {
      const actor = await createActor();
      const { token } = await issueValid(actor, `${unique("rate-limited")}@example.test`);
      let last: Awaited<ReturnType<typeof app.inject>> | undefined;
      // Limiter allows 20 requests/window per key (token+ip); the 21st trips it.
      for (let i = 0; i < 21; i += 1) {
        last = await app.inject({ method: "GET", url: `/v1/invitations/${token}` });
      }
      expectProblemJson(last!, { status: 429, slug: "rate-limited" });
    });
  });

  describe("POST /v1/invitations/:token/acceptance (accept)", () => {
    it("success: body validates against meResponseSchema", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email, "admin");
      const original = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });
      const response = await accept(original.rawToken, invitation.token);
      expect(response.statusCode).toBe(200);
      meResponseSchema.parse(response.json());
    });

    it("failure: not signed in -> 401 problem+json session-invalid", async () => {
      const actor = await createActor();
      const invitation = await issueValid(actor, `${unique("signed-in")}@example.test`);
      const token = await csrf();
      const response = await app.inject({
        method: "POST",
        url: `/v1/invitations/${invitation.token}/acceptance`,
        headers: { cookie: token.cookie, "x-csrf-token": token.token },
      });
      expectProblemJson(response, { status: 401, slug: "session-invalid" });
    });

    it("failure: signed-in user's email does not match invitation -> 403 problem+json email-mismatch", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const other = await createUser();
      const otherSession = await sessions.issue({
        userId: other.id as UserId,
        activeWorkspaceId: null,
      });
      const mismatch = await issueValid(actor, invitee.email);
      const response = await accept(otherSession.rawToken, mismatch.token);
      expectProblemJson(response, { status: 403, slug: "email-mismatch" });
    });

    it("failure: expired invitation -> 410 problem+json invitation-expired, no membership created", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email);
      await admin.query(
        "UPDATE public.invitations SET expires_at = now() - interval '1 second' WHERE id = $1",
        [invitation.id],
      );
      const session = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });
      const response = await accept(session.rawToken, invitation.token);
      expectProblemJson(response, { status: 410, slug: "invitation-expired" });
      expect(
        (
          await admin.query(
            "SELECT 1 FROM public.memberships WHERE workspace_id = $1 AND user_id = $2",
            [actor.workspaceId, invitee.id],
          )
        ).rows,
      ).toHaveLength(0);
    });

    it("failure: already a member -> 409 problem+json already-member, no role elevation", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const already = await issueValid(actor, invitee.email, "admin");
      await admin.query(
        "INSERT INTO public.memberships (workspace_id, user_id, role, permissions) VALUES ($1, $2, 'staff', ARRAY[]::text[])",
        [actor.workspaceId, invitee.id],
      );
      const inviteeSession = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });
      const response = await accept(inviteeSession.rawToken, already.token);
      expectProblemJson(response, { status: 409, slug: "already-member" });
    });
  });

  describe("PATCH /v1/invitations/:id (revoke)", () => {
    it("success: 204 no body", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email);
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/invitations/${invitation.id}`,
        headers: await stateHeaders(actor.rawSession),
        payload: { status: "revoked" },
      });
      expect(response.statusCode).toBe(204);
      expect(response.payload).toBe("");
    });

    it("failure: malformed body -> 400 problem+json validation", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email);
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/invitations/${invitation.id}`,
        headers: await stateHeaders(actor.rawSession),
        payload: { status: "not-a-real-status" },
      });
      expectProblemJson(response, { status: 400, slug: "validation" });
    });

    it("failure: missing members:invite capability -> 403 problem+json forbidden", async () => {
      const owner = await createActor();
      const restricted = await createActor([]);
      const invitation = await issueValid(owner, `${unique("isolated")}@example.test`);
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/invitations/${invitation.id}`,
        headers: await stateHeaders(restricted.rawSession),
        payload: { status: "revoked" },
      });
      expectProblemJson(response, { status: 403, slug: "forbidden" });
    });

    it("failure: cross-workspace invitation id -> 404 problem+json not-found", async () => {
      const owner = await createActor();
      const otherWorkspaceOwner = await createActor();
      const invitation = await issueValid(owner, `${unique("cross-ws")}@example.test`);
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/invitations/${invitation.id}`,
        headers: await stateHeaders(otherWorkspaceOwner.rawSession),
        payload: { status: "revoked" },
      });
      expectProblemJson(response, { status: 404, slug: "not-found" });
    });
  });
});
