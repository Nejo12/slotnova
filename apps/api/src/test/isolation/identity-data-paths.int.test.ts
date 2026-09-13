/**
 * T040 -- "exercise relevant identity data paths, not only raw-table happy
 * paths" and "preserve the narrowly approved self-membership lookup
 * semantics from PR-08 without turning it into an RLS bypass." Covers
 * `MembershipsRepository.listActiveMembershipsForUser` (PR-08) and
 * `findOwnMembershipInWorkspace` (T042) against real PostgreSQL.
 */
import { Client, Pool } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { runMigrations } from "@slotnova/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UserId, WorkspaceId } from "../../modules/identity/domain/ids.js";
import { MembershipsRepository } from "../../modules/identity/infrastructure/repositories/memberships.repository.js";

describe("identity self-lookup data paths (real PostgreSQL, T040)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;

  let userAId: string;
  let userBId: string;
  let workspaceOneId: string; // A: active membership, active workspace
  let workspaceTwoId: string; // A: suspended membership
  let workspaceThreeId: string; // B only
  let membershipOneId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });

    const userA = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('t040-a@example.test', 'A') RETURNING id`,
    );
    userAId = userA.rows[0]!.id;
    const userB = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('t040-b@example.test', 'B') RETURNING id`,
    );
    userBId = userB.rows[0]!.id;

    const wsOne = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('T040 WS One', 't040-ws-one') RETURNING id`,
    );
    workspaceOneId = wsOne.rows[0]!.id;
    const wsTwo = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('T040 WS Two', 't040-ws-two') RETURNING id`,
    );
    workspaceTwoId = wsTwo.rows[0]!.id;
    const wsThree = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('T040 WS Three', 't040-ws-three') RETURNING id`,
    );
    workspaceThreeId = wsThree.rows[0]!.id;

    const membershipOne = await admin.query<{ id: string }>(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') RETURNING id`,
      [workspaceOneId, userAId],
    );
    membershipOneId = membershipOne.rows[0]!.id;
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'staff', 'suspended')`,
      [workspaceTwoId, userAId],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')`,
      [workspaceThreeId, userBId],
    );
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  describe("listActiveMembershipsForUser", () => {
    it("returns only user A's own active-in-active-workspace memberships -- never user B's", async () => {
      const views = await new MembershipsRepository(pool).listActiveMembershipsForUser(
        userAId as UserId,
      );
      const workspaceIds = views.map((v) => v.workspaceId);
      expect(workspaceIds).toContain(workspaceOneId);
      expect(workspaceIds).not.toContain(workspaceThreeId); // user B's workspace
      expect(workspaceIds).not.toContain(workspaceTwoId); // suspended membership excluded
    });

    it("the additive self-lookup SELECT policy cannot be leveraged as a cross-workspace WRITE bypass", async () => {
      // Set ONLY app.user_id (as the repository does) -- no app.workspace_id
      // -- then attempt a raw UPDATE against a row this same user owns. The
      // self-lookup policy (0004_identity_membership_self_lookup.sql) is
      // FOR SELECT only; the workspace-scoped policy still governs UPDATE
      // and requires app.workspace_id, which is deliberately unset here.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.user_id', $1, true)", [userAId]);
        const result = await client.query(
          `UPDATE public.memberships SET role = 'admin' WHERE id = $1`,
          [membershipOneId],
        );
        expect(result.rowCount).toBe(0);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  describe("findOwnMembershipInWorkspace", () => {
    it("resolves the caller's own membership + statuses for a workspace they belong to", async () => {
      const view = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        workspaceOneId as WorkspaceId,
      );
      expect(view).toMatchObject({
        workspaceId: workspaceOneId,
        membershipStatus: "active",
        workspaceStatus: "active",
      });
    });

    it("reflects a suspended membership accurately", async () => {
      const view = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        workspaceTwoId as WorkspaceId,
      );
      expect(view).toMatchObject({ membershipStatus: "suspended" });
    });

    it("never returns user B's membership even when user A asks about user B's workspace", async () => {
      const view = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        workspaceThreeId as WorkspaceId,
      );
      expect(view).toBeNull();
    });

    it("returns identical null for 'workspace exists, not a member' and 'workspace does not exist' -- no oracle", async () => {
      const notAMember = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        workspaceThreeId as WorkspaceId,
      );
      const doesNotExist = await new MembershipsRepository(pool).findOwnMembershipInWorkspace(
        userAId as UserId,
        "00000000-0000-4000-8000-000000000000" as WorkspaceId,
      );
      expect(notAMember).toBeNull();
      expect(doesNotExist).toBeNull();
    });
  });
});
