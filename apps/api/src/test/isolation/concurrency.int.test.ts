/**
 * T044 -- genuine-concurrency tenant isolation (FR-046, SC-004). Every case
 * uses either independent `pg.Client` connections (`openIndependentConnections`)
 * fired via `Promise.all` so the queries are actually in flight at the same
 * time, or a `max: 1` pool to force the exact same physical connection to be
 * reused across back-to-back transactions -- the strongest possible proof
 * `SET LOCAL` never survives across pooled reuse. No sleeps.
 */
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, openIndependentConnections, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withWorkspaceContext } from "../../modules/platform/tenancy/with-workspace-context.js";
import type { UserId, WorkspaceId } from "../../modules/identity/domain/ids.js";
import { MembershipsRepository } from "../../modules/identity/infrastructure/repositories/memberships.repository.js";

describe("concurrent tenant isolation (real PostgreSQL, T044)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    const wsA = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('T044 WS A', 't044-ws-a') RETURNING id`,
    );
    workspaceAId = wsA.rows[0]!.id;
    const wsB = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('T044 WS B', 't044-ws-b') RETURNING id`,
    );
    workspaceBId = wsB.rows[0]!.id;

    await admin.query(
      `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'A Studio', 'Europe/Berlin')`,
      [workspaceAId],
    );
    await admin.query(
      `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'B Studio', 'Europe/Berlin')`,
      [workspaceBId],
    );

    const userA = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('t044-a@example.test', 'A') RETURNING id`,
    );
    userAId = userA.rows[0]!.id;
    const userB = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('t044-b@example.test', 'B') RETURNING id`,
    );
    userBId = userB.rows[0]!.id;
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceAId, userAId],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceBId, userBId],
    );
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await harness.stop();
  });

  it("1. two genuinely concurrent independent connections in different workspaces never cross-read", async () => {
    const connections1 = await openIndependentConnections(harness.appUri, 2);
    const clientA = connections1[0]!;
    const clientB = connections1[1]!;
    try {
      await Promise.all([clientA.query("BEGIN"), clientB.query("BEGIN")]);
      await Promise.all([
        clientA.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]),
        clientB.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceBId]),
      ]);

      const [resultA, resultB] = await Promise.all([
        clientA.query<{ workspace_id: string }>("SELECT workspace_id FROM public.locations"),
        clientB.query<{ workspace_id: string }>("SELECT workspace_id FROM public.locations"),
      ]);

      expect(resultA.rows.every((r) => r.workspace_id === workspaceAId)).toBe(true);
      expect(resultB.rows.every((r) => r.workspace_id === workspaceBId)).toBe(true);

      await Promise.all([clientA.query("COMMIT"), clientB.query("COMMIT")]);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  it("2. SET LOCAL never leaks across a pooled connection reused by back-to-back transactions", async () => {
    const pool = new Pool({ connectionString: harness.appUri, max: 1 });
    try {
      const seenByA = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        tx.query<{ workspace_id: string }>("SELECT workspace_id FROM public.locations"),
      );
      expect(seenByA.rows.every((r) => r.workspace_id === workspaceAId)).toBe(true);

      // Same physical connection (max: 1), immediately reused for workspace B
      // with NO explicit reset step -- withWorkspaceContext's own COMMIT is
      // the only thing that must clear the prior SET LOCAL.
      const seenByB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
        tx.query<{ workspace_id: string }>("SELECT workspace_id FROM public.locations"),
      );
      expect(seenByB.rows.every((r) => r.workspace_id === workspaceBId)).toBe(true);
      expect(seenByB.rows.some((r) => r.workspace_id === workspaceAId)).toBe(false);

      // And with no SET LOCAL issued at all on this same reused connection,
      // the setting is gone -- fail closed, not "sticky to the last value".
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<{ id: string }>("SELECT id FROM public.locations");
        expect(rows).toHaveLength(0);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it("3. one transaction's ROLLBACK cannot affect a concurrently-open transaction's context or data", async () => {
    const connections3 = await openIndependentConnections(harness.appUri, 2);
    const clientA = connections3[0]!;
    const clientB = connections3[1]!;
    try {
      await Promise.all([clientA.query("BEGIN"), clientB.query("BEGIN")]);
      await Promise.all([
        clientA.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]),
        clientB.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceBId]),
      ]);

      await Promise.all([
        clientA.query(
          "INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'A Rolled Back', 'Europe/Berlin')",
          [workspaceAId],
        ),
        clientB.query(
          "INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'B Committed', 'Europe/Berlin')",
          [workspaceBId],
        ),
      ]);

      await Promise.all([clientA.query("ROLLBACK"), clientB.query("COMMIT")]);

      const check = await openIndependentConnections(harness.appUri, 1);
      try {
        await check[0]!.query("BEGIN");
        await check[0]!.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceBId]);
        const { rows } = await check[0]!.query<{ name: string }>(
          "SELECT name FROM public.locations WHERE name = 'B Committed'",
        );
        expect(rows).toHaveLength(1);
        await check[0]!.query("COMMIT");
      } finally {
        await check[0]!.end();
      }

      const rolledBackCheck = await admin.query<{ name: string }>(
        "SELECT name FROM public.locations WHERE name = 'A Rolled Back'",
      );
      expect(rolledBackCheck.rows).toHaveLength(0);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  it("4. concurrent workspace-switch-style lookups for different users never expose the other tenant's data", async () => {
    const pool = new Pool({ connectionString: harness.appUri });
    try {
      const repo = new MembershipsRepository(pool);
      const [forA, forB] = await Promise.all([
        repo.findOwnMembershipInWorkspace(userAId as UserId, workspaceAId as WorkspaceId),
        repo.findOwnMembershipInWorkspace(userBId as UserId, workspaceBId as WorkspaceId),
      ]);
      expect(forA).toMatchObject({ workspaceId: workspaceAId });
      expect(forB).toMatchObject({ workspaceId: workspaceBId });

      // Cross-checked concurrently in the SAME Promise.all round: A asking
      // about B's workspace, and B asking about A's, both in flight together.
      const [aIntoB, bIntoA] = await Promise.all([
        repo.findOwnMembershipInWorkspace(userAId as UserId, workspaceBId as WorkspaceId),
        repo.findOwnMembershipInWorkspace(userBId as UserId, workspaceAId as WorkspaceId),
      ]);
      expect(aIntoB).toBeNull();
      expect(bIntoA).toBeNull();
    } finally {
      await pool.end();
    }
  });
});
