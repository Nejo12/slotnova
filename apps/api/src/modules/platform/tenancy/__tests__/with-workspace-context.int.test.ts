import { assertNonBypassRlsRole, Client, Pool } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withWorkspaceContext } from "../with-workspace-context.js";

const WORKSPACE_A = "11111111-1111-1111-1111-111111111111";
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222";

/**
 * T021 — tenancy transaction-context primitive, proved against real
 * PostgreSQL (ADR-008, data-model.md "Tenant context contract"). Uses a
 * test-only fixture table (never a product/domain table) purely to observe
 * `SET LOCAL`/RLS behavior — the identity repositories that will actually use
 * this primitive are a later PR (T034).
 */
describe("withWorkspaceContext (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  // max: 1 so every `pool.connect()` in this suite reuses the exact same
  // physical connection — the strongest possible proof that a transaction's
  // `SET LOCAL` context does not survive onto the next transaction.
  let pool: Pool;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    pool = new Pool({ connectionString: harness.appUri, max: 1 });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    await admin.query(`
      CREATE TABLE test_only_notes (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        body         text NOT NULL
      )
    `);
    await admin.query(`GRANT SELECT, INSERT ON test_only_notes TO ${harness.appRole}`);
    await admin.query(`ALTER TABLE test_only_notes ENABLE ROW LEVEL SECURITY`);
    await admin.query(`ALTER TABLE test_only_notes FORCE ROW LEVEL SECURITY`);
    await admin.query(`
      CREATE POLICY test_only_notes_workspace_isolation ON test_only_notes
        USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
        WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    `);
  }, 120_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("uses an RLS-subject role, never BYPASSRLS/superuser", async () => {
    const client = await pool.connect();
    try {
      await expect(assertNonBypassRlsRole(client)).resolves.toBeUndefined();
    } finally {
      client.release();
    }
  });

  it("makes SET LOCAL workspace/user/request ids visible inside the transaction", async () => {
    const seen = await withWorkspaceContext(
      pool,
      { workspaceId: WORKSPACE_A, userId: "user-1", requestId: "req-1" },
      async (tx) => {
        const { rows } = await tx.query<{
          workspace_id: string;
          user_id: string;
          request_id: string;
        }>(`
          SELECT current_setting('app.workspace_id', true) AS workspace_id,
                 current_setting('app.user_id', true)      AS user_id,
                 current_setting('app.request_id', true)   AS request_id
        `);
        return rows[0]!;
      },
    );

    expect(seen).toEqual({ workspace_id: WORKSPACE_A, user_id: "user-1", request_id: "req-1" });
  });

  it("commits the callback's writes", async () => {
    const created = await withWorkspaceContext(pool, { workspaceId: WORKSPACE_A }, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO test_only_notes (workspace_id, body) VALUES ($1, $2) RETURNING id",
        [WORKSPACE_A, "committed note"],
      );
      return rows[0]!.id;
    });

    const visible = await withWorkspaceContext(pool, { workspaceId: WORKSPACE_A }, async (tx) => {
      const { rows } = await tx.query("SELECT id FROM test_only_notes WHERE id = $1", [created]);
      return rows;
    });
    expect(visible).toHaveLength(1);
  });

  it("rolls back when the callback throws", async () => {
    await expect(
      withWorkspaceContext(pool, { workspaceId: WORKSPACE_A }, async (tx) => {
        await tx.query("INSERT INTO test_only_notes (workspace_id, body) VALUES ($1, $2)", [
          WORKSPACE_A,
          "should not persist",
        ]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const remaining = await withWorkspaceContext(pool, { workspaceId: WORKSPACE_A }, async (tx) => {
      const { rows } = await tx.query("SELECT id FROM test_only_notes WHERE body = $1", [
        "should not persist",
      ]);
      return rows;
    });
    expect(remaining).toHaveLength(0);
  });

  it("does not leak context onto the next transaction on the same connection", async () => {
    await withWorkspaceContext(pool, { workspaceId: WORKSPACE_A }, async () => undefined);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ workspace_id: string | null }>(
        "SELECT current_setting('app.workspace_id', true) AS workspace_id",
      );
      // No SET LOCAL was issued in *this* transaction, so the setting from the
      // previous transaction (on the very same physical connection) must be
      // gone — PostgreSQL's own placeholder-GUC behavior across a reset
      // determines whether that reads back as NULL or "", so accept either.
      expect(rows[0]!.workspace_id).toBeFalsy();
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("fails closed: a query with no workspace context sees no tenant rows, even for an existing workspace", async () => {
    await withWorkspaceContext(pool, { workspaceId: WORKSPACE_B }, async (tx) => {
      await tx.query("INSERT INTO test_only_notes (workspace_id, body) VALUES ($1, $2)", [
        WORKSPACE_B,
        "workspace B data",
      ]);
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Deliberately no SET LOCAL app.workspace_id — the fail-closed path.
      const { rows } = await client.query("SELECT id FROM test_only_notes");
      expect(rows).toHaveLength(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("keeps workspace A and workspace B mutually invisible", async () => {
    const bWorkspaceView = await withWorkspaceContext(
      pool,
      { workspaceId: WORKSPACE_B },
      async (tx) => {
        const { rows } = await tx.query("SELECT workspace_id FROM test_only_notes");
        return rows;
      },
    );
    expect(
      bWorkspaceView.every((r: { workspace_id: string }) => r.workspace_id === WORKSPACE_B),
    ).toBe(true);
  });
});
