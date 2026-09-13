import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../../../config/security-config.js";
import { createApp } from "../../../../main.js";
import { csrfCookieName } from "../../../platform/security/csrf.js";
import { sessionCookieName } from "../../application/session/session-cookie.js";
import { SessionService } from "../../application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../domain/ids.js";
import { hashInvitationToken } from "../../domain/invitation-token.js";
import { SessionsRepository } from "../../infrastructure/repositories/sessions.repository.js";

interface Actor {
  userId: string;
  workspaceId: string;
  rawSession: string;
}

describe("invitation issuance, preview, acceptance, and revoke (real PostgreSQL)", () => {
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

  async function waitForDatabaseWait(queryPattern: string, minimum: number): Promise<void> {
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const result = await admin.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query LIKE $1`,
        [queryPattern],
      );
      if (result.rows[0]!.count >= minimum) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`database operation did not reach lock wait: ${queryPattern}`);
  }

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
      "INSERT INTO public.users (email, display_name) VALUES ($1, 'Invite User') RETURNING id",
      [email],
    );
    return { id: result.rows[0]!.id, email };
  }

  async function createActor(permissions = ["members:invite"]): Promise<Actor> {
    const suffix = unique("workspace");
    const workspace = await admin.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id",
      [`Workspace ${suffix}`, suffix],
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

  describe("issue", () => {
    it("persists only the hash and atomically writes audit and outbox", async () => {
      const actor = await createActor();
      const email = `${unique("issued")}@example.test`;
      const { body, id, token } = await issueValid(actor, email, "staff");
      expect(body.invitation).toMatchObject({ id, email, role: "staff", status: "pending" });
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const invitation = await admin.query(
        "SELECT token_hash, role FROM public.invitations WHERE id = $1",
        [id],
      );
      expect(invitation.rows[0].token_hash).toBe(hashInvitationToken(token));
      expect(invitation.rows[0].token_hash).not.toBe(token);
      expect(invitation.rows[0].role).toBe("staff");
      const audit = await admin.query(
        "SELECT action FROM public.audit_records WHERE entity_id = $1",
        [id],
      );
      expect(audit.rows.map((row) => row.action)).toEqual(["invitation.issued"]);
      const outbox = await admin.query(
        "SELECT event_name, event_version, payload FROM public.outbox_records WHERE payload->>'invitationId' = $1",
        [id],
      );
      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0]).toMatchObject({ event_name: "invitation.issued", event_version: 1 });
      expect(outbox.rows[0].payload).not.toHaveProperty("email");
      expect(
        JSON.stringify({ invitation: invitation.rows[0], audit: audit.rows, outbox: outbox.rows }),
      ).not.toContain(token);
    });

    it("rejects missing capability, owner, duplicate pending, and active member", async () => {
      const denied = await createActor([]);
      const deniedResponse = await issue(denied, `${unique("denied")}@example.test`);
      expect(deniedResponse.statusCode).toBe(403);
      expect(deniedResponse.json().requiredCapability).toBe("members:invite");

      const actor = await createActor();
      expect((await issue(actor, `${unique("owner")}@example.test`, "owner")).statusCode).toBe(400);
      const duplicateEmail = `${unique("duplicate")}@example.test`;
      await issueValid(actor, duplicateEmail);
      expect((await issue(actor, duplicateEmail)).statusCode).toBe(409);

      const member = await createUser();
      await admin.query(
        "INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'staff')",
        [actor.workspaceId, member.id],
      );
      const memberResponse = await issue(actor, member.email);
      expect(memberResponse.statusCode).toBe(409);
      expect(memberResponse.json().type).toContain("/already-member");
    });

    it("rolls invitation, audit, and outbox back together on forced outbox failure", async () => {
      const actor = await createActor();
      const email = `${unique("rollback-issue")}@example.test`;
      const before = await admin.query(
        `SELECT
          (SELECT count(*)::int FROM public.audit_records) AS audits,
          (SELECT count(*)::int FROM public.outbox_records) AS outbox`,
      );
      await admin.query(`CREATE OR REPLACE FUNCTION fail_issue_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.event_name = 'invitation.issued' THEN RAISE EXCEPTION 'forced'; END IF; RETURN NEW; END $$`);
      await admin.query(
        "CREATE TRIGGER fail_issue_outbox BEFORE INSERT ON public.outbox_records FOR EACH ROW EXECUTE FUNCTION fail_issue_outbox()",
      );
      try {
        expect((await issue(actor, email)).statusCode).toBe(500);
      } finally {
        await admin.query("DROP TRIGGER fail_issue_outbox ON public.outbox_records");
        await admin.query("DROP FUNCTION fail_issue_outbox()");
      }
      expect(
        (await admin.query("SELECT 1 FROM public.invitations WHERE email = $1", [email])).rows,
      ).toHaveLength(0);
      const after = await admin.query(
        `SELECT
          (SELECT count(*)::int FROM public.audit_records) AS audits,
          (SELECT count(*)::int FROM public.outbox_records) AS outbox`,
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  });

  describe("preview", () => {
    it("is PII-light, prefetch-safe, and performs zero database mutation", async () => {
      const actor = await createActor();
      const email = `${unique("preview")}@example.test`;
      const { id, token } = await issueValid(actor, email);
      const before = await admin.query(
        `SELECT status, updated_at,
          (SELECT count(*) FROM public.audit_records) AS audits,
          (SELECT count(*) FROM public.outbox_records) AS outbox
         FROM public.invitations WHERE id = $1`,
        [id],
      );
      const first = await app.inject({ method: "GET", url: `/v1/invitations/${token}` });
      const second = await app.inject({ method: "GET", url: `/v1/invitations/${token}` });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json()).toEqual(second.json());
      expect(Object.keys(first.json()).sort()).toEqual(
        ["email", "expiresAt", "role", "status", "workspaceName"].sort(),
      );
      const after = await admin.query(
        `SELECT status, updated_at,
          (SELECT count(*) FROM public.audit_records) AS audits,
          (SELECT count(*) FROM public.outbox_records) AS outbox
         FROM public.invitations WHERE id = $1`,
        [id],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("is probing-safe for garbage/revoked and returns 410 for expired/used", async () => {
      expect((await app.inject({ method: "GET", url: "/v1/invitations/garbage" })).statusCode).toBe(
        404,
      );
      const actor = await createActor();
      const revoked = await issueValid(actor, `${unique("revoked-preview")}@example.test`);
      await admin.query("UPDATE public.invitations SET status = 'revoked' WHERE id = $1", [
        revoked.id,
      ]);
      expect(
        (await app.inject({ method: "GET", url: `/v1/invitations/${revoked.token}` })).statusCode,
      ).toBe(404);
      const expired = await issueValid(actor, `${unique("expired-preview")}@example.test`);
      await admin.query(
        "UPDATE public.invitations SET expires_at = now() - interval '1 second' WHERE id = $1",
        [expired.id],
      );
      expect(
        (await app.inject({ method: "GET", url: `/v1/invitations/${expired.token}` })).statusCode,
      ).toBe(410);
      const used = await issueValid(actor, `${unique("used-preview")}@example.test`);
      await admin.query("UPDATE public.invitations SET status = 'accepted' WHERE id = $1", [
        used.id,
      ]);
      expect(
        (await app.inject({ method: "GET", url: `/v1/invitations/${used.token}` })).statusCode,
      ).toBe(410);
    });
  });

  describe("acceptance", () => {
    it("requires a signed-in user", async () => {
      const actor = await createActor();
      const invitation = await issueValid(actor, `${unique("signed-in")}@example.test`);
      const token = await csrf();
      const response = await app.inject({
        method: "POST",
        url: `/v1/invitations/${invitation.token}/acceptance`,
        headers: { cookie: token.cookie, "x-csrf-token": token.token },
      });
      expect(response.statusCode).toBe(401);
    });

    it("creates exact-role membership/canonical permissions/effects and rotates session + CSRF", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email, "admin");
      const original = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });
      const response = await accept(original.rawToken, invitation.token);
      expect(response.statusCode).toBe(200);
      expect(response.json().activeWorkspace).toMatchObject({
        id: actor.workspaceId,
        role: "admin",
        permissions: ["members:invite", "members:manage"],
      });
      const newSession = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE)!;
      expect(newSession.value).not.toBe(original.rawToken);
      expect(response.cookies.some((cookie) => cookie.name === CSRF_COOKIE)).toBe(true);
      expect(await sessions.validate(original.rawToken)).toBeNull();
      expect((await sessions.validate(newSession.value))?.activeWorkspaceId).toBe(
        actor.workspaceId,
      );

      const membership = await admin.query(
        "SELECT id, role, permissions FROM public.memberships WHERE workspace_id = $1 AND user_id = $2",
        [actor.workspaceId, invitee.id],
      );
      expect(membership.rows).toHaveLength(1);
      expect(membership.rows[0]).toMatchObject({
        role: "admin",
        permissions: ["members:invite", "members:manage"],
      });
      expect(
        (await admin.query("SELECT status FROM public.invitations WHERE id = $1", [invitation.id]))
          .rows[0].status,
      ).toBe("accepted");
      const audit = await admin.query(
        "SELECT action FROM public.audit_records WHERE entity_id IN ($1, $2) ORDER BY action",
        [invitation.id, membership.rows[0].id],
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        "invitation.accepted",
        "invitation.issued",
        "membership.created",
      ]);
      const outbox = await admin.query(
        "SELECT event_name FROM public.outbox_records WHERE payload->>'membershipId' = $1 ORDER BY event_name",
        [membership.rows[0].id],
      );
      expect(outbox.rows.map((row) => row.event_name)).toEqual([
        "invitation.accepted",
        "membership.created",
      ]);
    });

    it("rejects email mismatch, expired, revoked, used, and already-member without elevation", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const other = await createUser();
      const otherSession = await sessions.issue({
        userId: other.id as UserId,
        activeWorkspaceId: null,
      });
      const mismatch = await issueValid(actor, invitee.email);
      expect((await accept(otherSession.rawToken, mismatch.token)).statusCode).toBe(403);
      await admin.query("UPDATE public.invitations SET status = 'revoked' WHERE id = $1", [
        mismatch.id,
      ]);

      for (const status of ["expired", "revoked", "accepted"] as const) {
        const candidate = await issueValid(actor, `${unique(status)}@example.test`);
        await admin.query(
          status === "expired"
            ? "UPDATE public.invitations SET expires_at = now() - interval '1 second' WHERE id = $1"
            : "UPDATE public.invitations SET status = $2 WHERE id = $1",
          status === "expired" ? [candidate.id] : [candidate.id, status],
        );
        expect((await accept(otherSession.rawToken, candidate.token)).statusCode).toBe(410);
      }

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
      expect(response.statusCode).toBe(409);
      expect(
        (
          await admin.query(
            "SELECT role FROM public.memberships WHERE workspace_id = $1 AND user_id = $2",
            [actor.workspaceId, invitee.id],
          )
        ).rows[0].role,
      ).toBe("staff");
    });

    it("allows exactly one of two genuinely-overlapping, independent-connection attempts", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email, "manager");
      const session = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });

      const gate = new Client({ connectionString: harness.adminUri });
      await gate.connect();
      await admin.query(`CREATE OR REPLACE FUNCTION gate_manager_membership() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.role = 'manager' THEN PERFORM pg_advisory_xact_lock(3310047); END IF; RETURN NEW; END $$`);
      await admin.query(
        "CREATE TRIGGER gate_manager_membership BEFORE INSERT ON public.memberships FOR EACH ROW EXECUTE FUNCTION gate_manager_membership()",
      );
      try {
        await gate.query("BEGIN");
        await gate.query("SELECT pg_advisory_xact_lock(3310047)");
        const firstAttempt = accept(session.rawToken, invitation.token);
        await waitForDatabaseWait("INSERT INTO public.memberships%", 1);

        const secondAttempt = accept(session.rawToken, invitation.token);
        await waitForDatabaseWait("%FOR UPDATE OF i", 1);
        await gate.query("COMMIT");
        const [first, second] = await Promise.all([firstAttempt, secondAttempt]);
        expect([first.statusCode, second.statusCode].sort()).toEqual([200, 410]);
      } finally {
        await gate.query("ROLLBACK").catch(() => undefined);
        await gate.end();
        await admin.query("DROP TRIGGER gate_manager_membership ON public.memberships");
        await admin.query("DROP FUNCTION gate_manager_membership()");
      }
      expect(
        (
          await admin.query(
            "SELECT role FROM public.memberships WHERE workspace_id = $1 AND user_id = $2",
            [actor.workspaceId, invitee.id],
          )
        ).rows,
      ).toEqual([{ role: "manager" }]);
      expect(
        (
          await admin.query(
            "SELECT count(*)::int AS count FROM public.audit_records WHERE action = 'membership.created' AND workspace_id = $1",
            [actor.workspaceId],
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await admin.query(
            `SELECT count(*)::int AS count
               FROM public.outbox_records
              WHERE workspace_id = $1
                AND event_name IN ('invitation.accepted', 'membership.created')`,
            [actor.workspaceId],
          )
        ).rows[0].count,
      ).toBe(2);
    });

    it("rolls invitation, membership, audit, and outbox back on forced transaction failure", async () => {
      const actor = await createActor();
      const invitee = await createUser();
      const invitation = await issueValid(actor, invitee.email);
      const session = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });
      await admin.query(`CREATE OR REPLACE FUNCTION fail_accept_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.event_name = 'membership.created' THEN RAISE EXCEPTION 'forced'; END IF; RETURN NEW; END $$`);
      await admin.query(
        "CREATE TRIGGER fail_accept_outbox BEFORE INSERT ON public.outbox_records FOR EACH ROW EXECUTE FUNCTION fail_accept_outbox()",
      );
      try {
        expect((await accept(session.rawToken, invitation.token)).statusCode).toBe(500);
      } finally {
        await admin.query("DROP TRIGGER fail_accept_outbox ON public.outbox_records");
        await admin.query("DROP FUNCTION fail_accept_outbox()");
      }
      expect(
        (await admin.query("SELECT status FROM public.invitations WHERE id = $1", [invitation.id]))
          .rows[0].status,
      ).toBe("pending");
      expect(
        (
          await admin.query(
            "SELECT 1 FROM public.memberships WHERE workspace_id = $1 AND user_id = $2",
            [actor.workspaceId, invitee.id],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await admin.query("SELECT action FROM public.audit_records WHERE entity_id = $1", [
            invitation.id,
          ])
        ).rows.map((row) => row.action),
      ).toEqual(["invitation.issued"]);
      expect(
        (
          await admin.query(
            "SELECT event_name FROM public.outbox_records WHERE payload->>'invitationId' = $1 ORDER BY event_name",
            [invitation.id],
          )
        ).rows.map((row) => row.event_name),
      ).toEqual(["invitation.issued"]);
    });
  });

  describe("revoke and isolation", () => {
    it("allows authorized revoke, writes audit, and prevents acceptance", async () => {
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
      expect(
        (
          await admin.query(
            "SELECT action FROM public.audit_records WHERE entity_id = $1 ORDER BY occurred_at",
            [invitation.id],
          )
        ).rows.map((row) => row.action),
      ).toEqual(["invitation.issued", "invitation.revoked"]);
      const inviteeSession = await sessions.issue({
        userId: invitee.id as UserId,
        activeWorkspaceId: null,
      });
      expect((await accept(inviteeSession.rawToken, invitation.token)).statusCode).toBe(410);
    });

    it("denies unauthorized and cross-workspace revoke", async () => {
      const owner = await createActor();
      const restricted = await createActor([]);
      const otherWorkspaceOwner = await createActor();
      const invitation = await issueValid(owner, `${unique("isolated")}@example.test`);
      const denied = await app.inject({
        method: "PATCH",
        url: `/v1/invitations/${invitation.id}`,
        headers: await stateHeaders(restricted.rawSession),
        payload: { status: "revoked" },
      });
      expect(denied.statusCode).toBe(403);
      const cross = await app.inject({
        method: "PATCH",
        url: `/v1/invitations/${invitation.id}`,
        headers: await stateHeaders(otherWorkspaceOwner.rawSession),
        payload: { status: "revoked" },
      });
      expect(cross.statusCode).toBe(404);
      expect(
        (await admin.query("SELECT status FROM public.invitations WHERE id = $1", [invitation.id]))
          .rows[0].status,
      ).toBe("pending");
    });
  });
});
