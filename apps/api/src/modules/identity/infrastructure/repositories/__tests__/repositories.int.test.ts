import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UserId } from "../../../domain/ids.js";
import { MembershipsRepository } from "../memberships.repository.js";
import { SessionsRepository } from "../sessions.repository.js";
import { UsersRepository } from "../users.repository.js";

/**
 * T034 -- tenant-scoped identity repositories, proven against real
 * PostgreSQL. `UsersRepository`/`SessionsRepository` are platform-scoped (no
 * RLS, data-model.md); `MembershipsRepository.listActiveMembershipsForUser`
 * is the FR-030 narrowly-reviewed exception and must be proven isolated
 * per-user under the `memberships_self_lookup` policy
 * (`0004_identity_membership_self_lookup.sql`).
 */
describe("identity repositories (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;

  let userAId: string;
  let userBId: string;
  let workspaceOneId: string;
  let workspaceTwoId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });

    const userA = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('repo-a@example.test', 'Repo A') RETURNING id`,
    );
    userAId = userA.rows[0]!.id;
    const userB = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('repo-b@example.test', 'Repo B') RETURNING id`,
    );
    userBId = userB.rows[0]!.id;

    const wsOne = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Repo Workspace One', 'repo-ws-one') RETURNING id`,
    );
    workspaceOneId = wsOne.rows[0]!.id;
    const wsTwo = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Repo Workspace Two', 'repo-ws-two') RETURNING id`,
    );
    workspaceTwoId = wsTwo.rows[0]!.id;

    // User A: active memberships in both workspaces. User B: none.
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions) VALUES ($1, $2, 'owner', ARRAY['members:invite'])`,
      [workspaceOneId, userAId],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'staff')`,
      [workspaceTwoId, userAId],
    );
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  describe("UsersRepository", () => {
    const repo = () => new UsersRepository(pool);

    it("finds a user by email", async () => {
      const found = await repo().findByEmail("repo-a@example.test");
      expect(found?.id).toEqual(userAId);
      expect(found?.status).toEqual("active");
    });

    it("returns null for an unknown email", async () => {
      expect(await repo().findByEmail("nobody@example.test")).toBeNull();
    });

    it("links an external ref only once, never reassigning an existing link", async () => {
      const repository = repo();
      await repository.linkExternalRef(userBId as UserId, "dev-seed:repo-b@example.test");
      const linked = await repository.findByExternalRef("dev-seed:repo-b@example.test");
      expect(linked?.id).toEqual(userBId);

      // A second attempt to link a DIFFERENT ref must not overwrite the first.
      await repository.linkExternalRef(userBId as UserId, "dev-seed:different@example.test");
      const stillLinked = await repository.findByExternalRef("dev-seed:repo-b@example.test");
      expect(stillLinked?.id).toEqual(userBId);
      expect(await repository.findByExternalRef("dev-seed:different@example.test")).toBeNull();
    });
  });

  describe("MembershipsRepository.listActiveMembershipsForUser", () => {
    it("returns every active workspace membership for the given user only", async () => {
      const views = await new MembershipsRepository(pool).listActiveMembershipsForUser(
        userAId as UserId,
      );
      expect(views).toHaveLength(2);
      const workspaceIds = views.map((v) => v.workspaceId).sort();
      expect(workspaceIds).toEqual([workspaceOneId, workspaceTwoId].sort());
      const owner = views.find((v) => v.workspaceId === workspaceOneId);
      expect(owner?.role).toEqual("owner");
      expect(owner?.permissions).toEqual(["members:invite"]);
    });

    it("returns nothing for a user with no memberships -- never another user's rows", async () => {
      const views = await new MembershipsRepository(pool).listActiveMembershipsForUser(
        userBId as UserId,
      );
      expect(views).toEqual([]);
    });

    it("is isolated per user even when queried concurrently (independent connections)", async () => {
      const repo = new MembershipsRepository(pool);
      const [forA, forB] = await Promise.all([
        repo.listActiveMembershipsForUser(userAId as UserId),
        repo.listActiveMembershipsForUser(userBId as UserId),
      ]);
      expect(forA.length).toBeGreaterThan(0);
      expect(forB).toEqual([]);
    });
  });

  describe("MembershipsRepository.findOwnMembershipInWorkspace", () => {
    it("returns the caller's own membership + workspace status for a workspace they belong to", async () => {
      const view = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        workspaceOneId as any,
      );
      expect(view).toMatchObject({
        workspaceId: workspaceOneId,
        role: "owner",
        membershipStatus: "active",
        workspaceStatus: "active",
      });
    });

    it("returns null for a workspace the user does not belong to -- no existence disclosure", async () => {
      // workspaceOneId is real and belongs to userA in this fixture set;
      // userB has no membership there, proving the "workspace exists, but
      // I'm not a member" case returns null with no distinguishing detail.
      const view = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userBId as UserId,
        workspaceOneId as any,
      );
      expect(view).toBeNull();
    });

    it("returns null for a workspace id that does not exist at all -- identical null, no oracle", async () => {
      const view = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        "00000000-0000-4000-8000-000000000000" as any,
      );
      expect(view).toBeNull();
    });

    it("never returns another user's membership even for the same workspace", async () => {
      const forB = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userBId as UserId,
        workspaceOneId as any,
      );
      expect(forB).toBeNull();
    });
  });

  describe("SessionsRepository", () => {
    it("inserts, finds active, and fails closed once revoked", async () => {
      const repo = new SessionsRepository(pool);
      const created = await repo.insert({
        hashedId: "11111111-2222-4333-8444-555555555555",
        userId: userAId as UserId,
        activeWorkspaceId: null,
        expiresAt: new Date(Date.now() + 60_000),
        rotatedFrom: null,
        clientHint: {},
      });
      expect(created.id).toEqual("11111111-2222-4333-8444-555555555555");

      const found = await repo.findActiveByHashedId(created.id);
      expect(found?.userId).toEqual(userAId);

      await repo.revoke(created.id);
      expect(await repo.findActiveByHashedId(created.id)).toBeNull();

      // Idempotent revoke -- no throw.
      await expect(repo.revoke(created.id)).resolves.toBeUndefined();
    });

    it("fails closed for an expired session even though the row still exists", async () => {
      const repo = new SessionsRepository(pool);
      const created = await repo.insert({
        hashedId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
        userId: userAId as UserId,
        activeWorkspaceId: null,
        expiresAt: new Date(Date.now() - 1_000),
        rotatedFrom: null,
        clientHint: {},
      });
      expect(await repo.findActiveByHashedId(created.id)).toBeNull();
    });
  });
});
