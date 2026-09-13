import { Client, DEFAULT_MIGRATIONS_DIR, Pool, runMigrations } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  assertCleanMigration,
  assertForwardMigration,
  assertRlsCoverage,
  openIndependentConnections,
  startPostgres,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withWorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";

/**
 * T033 — identity schema + migration + RLS tests (real PostgreSQL). Proves
 * `packages/db/migrations/0002_identity.sql` against a real server: clean and
 * forward apply, the invariants data-model.md documents (membership
 * uniqueness, pending-invitation uniqueness, hashed-token-only storage,
 * session relationships), and RLS coverage/isolation for the tenant-owned
 * tables it ships (`locations`, `memberships`, `invitations`).
 *
 * The exhaustive cross-tenant isolation suite over every table/path is T040
 * (out of scope here) — this file proves isolation specifically for the
 * tables this migration introduces.
 */
describe("identity migrations (real PostgreSQL)", () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
  }, 180_000);

  afterAll(async () => {
    await harness.stop();
  });

  it("applies cleanly to an empty database and is idempotent", async () => {
    const result = await assertCleanMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
    });
    expect(result.appliedVersions).toEqual(expect.arrayContaining(["0002", "0003"]));
  });

  it("applies forward onto a populated prior state without data loss", async () => {
    await assertForwardMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
      stopBefore: "0002",
      seed: async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.outbox_records (event_name, payload)
           VALUES ('platform.pre_identity_marker', '{"requestId":"req-forward-1"}'::jsonb)
           RETURNING id`,
        );
        return rows[0]!.id;
      },
      verify: async (client, seededId) => {
        const { rows } = await client.query("SELECT id FROM public.outbox_records WHERE id = $1", [
          seededId,
        ]);
        expect(rows).toHaveLength(1);
      },
    });
  });

  it("has RLS enabled + forced + policy on every identity/audit tenant-owned table", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      await expect(
        assertRlsCoverage(admin, [
          { schema: "public", table: "locations" },
          { schema: "public", table: "memberships" },
          { schema: "public", table: "invitations" },
          { schema: "public", table: "audit_records" },
        ]),
      ).resolves.toHaveLength(4);
    } finally {
      await admin.end();
    }
  });

  it("does NOT enable RLS on users/workspaces/sessions (platform-scoped, per data-model.md)", async () => {
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows } = await admin.query<{ relname: string; relrowsecurity: boolean }>(`
        SELECT relname, relrowsecurity
          FROM pg_class
         WHERE relname IN ('users', 'workspaces', 'sessions')
      `);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.relrowsecurity).toBe(false);
      }
    } finally {
      await admin.end();
    }
  });
});

describe("identity constraints (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let workspaceId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Acme Studio', 'acme-studio-t033')
       RETURNING id`,
    );
    workspaceId = workspace.rows[0]!.id;

    const userA = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('a@example.test', 'A') RETURNING id`,
    );
    userAId = userA.rows[0]!.id;
    const userB = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('b@example.test', 'B') RETURNING id`,
    );
    userBId = userB.rows[0]!.id;
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await harness.stop();
  });

  it("rejects a duplicate (workspace_id, user_id) membership", async () => {
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceId, userAId],
    );

    await expect(
      admin.query(
        `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`,
        [workspaceId, userAId],
      ),
    ).rejects.toThrow(/duplicate key value/);
  });

  it("enforces at most one pending invitation per (workspace_id, email), but allows a fresh one once the prior is no longer pending", async () => {
    const membership = await admin.query<{ id: string }>(
      `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')
       RETURNING id`,
      [workspaceId, userBId],
    );
    const invitedBy = membership.rows[0]!.id;

    const first = await admin.query<{ id: string }>(
      `INSERT INTO public.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
       VALUES ($1, 'invitee@example.test', 'staff', 'hash-one', now() + interval '7 days', $2)
       RETURNING id`,
      [workspaceId, invitedBy],
    );

    await expect(
      admin.query(
        `INSERT INTO public.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
         VALUES ($1, 'invitee@example.test', 'staff', 'hash-two', now() + interval '7 days', $2)`,
        [workspaceId, invitedBy],
      ),
    ).rejects.toThrow(/duplicate key value/);

    // Revoking the first invitation frees the (workspace_id, email) slot —
    // history remains (data-model.md: "an accepted/revoked/expired row does
    // not block a fresh invite").
    await admin.query(`UPDATE public.invitations SET status = 'revoked' WHERE id = $1`, [
      first.rows[0]!.id,
    ]);

    await expect(
      admin.query(
        `INSERT INTO public.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
         VALUES ($1, 'invitee@example.test', 'staff', 'hash-three', now() + interval '7 days', $2)
         RETURNING id`,
        [workspaceId, invitedBy],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    const historyCount = await admin.query(
      `SELECT count(*)::int AS n FROM public.invitations WHERE workspace_id = $1 AND email = 'invitee@example.test'`,
      [workspaceId],
    );
    expect(historyCount.rows[0]!.n).toBe(2);
  });

  it("stores only a hashed token — there is no raw-token column on invitations", async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations'`,
    );
    const columnNames = rows.map((r) => r.column_name);
    expect(columnNames).toContain("token_hash");
    expect(columnNames).not.toContain("token");
    expect(columnNames).not.toContain("raw_token");
  });

  it("session relationships: requires a user, allows null active_workspace_id, and supports self-referencing rotation", async () => {
    const session = await admin.query<{ id: string }>(
      `INSERT INTO public.sessions (user_id, expires_at) VALUES ($1, now() + interval '1 hour') RETURNING id`,
      [userAId],
    );
    const firstSessionId = session.rows[0]!.id;

    const rotated = await admin.query<{ id: string }>(
      `INSERT INTO public.sessions (user_id, active_workspace_id, expires_at, rotated_from)
       VALUES ($1, $2, now() + interval '1 hour', $3)
       RETURNING id`,
      [userAId, workspaceId, firstSessionId],
    );
    expect(rotated.rows[0]!.id).toBeDefined();

    await expect(
      admin.query(`INSERT INTO public.sessions (expires_at) VALUES (now() + interval '1 hour')`),
    ).rejects.toThrow(/null value in column "user_id"/);
  });
});

describe("identity RLS isolation (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    const a = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Workspace A', 'ws-a-t033') RETURNING id`,
    );
    workspaceA = a.rows[0]!.id;
    const b = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Workspace B', 'ws-b-t033') RETURNING id`,
    );
    workspaceB = b.rows[0]!.id;

    // Seed one location per workspace as the app role, under correct context.
    const pool = new Pool({ connectionString: harness.appUri });
    try {
      await withWorkspaceContext(pool, { workspaceId: workspaceA }, (tx) =>
        tx.query(
          `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'A HQ', 'Europe/Berlin')`,
          [workspaceA],
        ),
      );
      await withWorkspaceContext(pool, { workspaceId: workspaceB }, (tx) =>
        tx.query(
          `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'B HQ', 'Europe/Berlin')`,
          [workspaceB],
        ),
      );
    } finally {
      await pool.end();
    }
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await harness.stop();
  });

  it("workspace A cannot see workspace B's locations, and vice versa (independent connections)", async () => {
    const poolA = new Pool({ connectionString: harness.appUri });
    const poolB = new Pool({ connectionString: harness.appUri });
    try {
      const viewFromA = await withWorkspaceContext(
        poolA,
        { workspaceId: workspaceA },
        async (tx) => {
          const { rows } = await tx.query<{ workspace_id: string }>(
            "SELECT workspace_id FROM public.locations",
          );
          return rows;
        },
      );
      const viewFromB = await withWorkspaceContext(
        poolB,
        { workspaceId: workspaceB },
        async (tx) => {
          const { rows } = await tx.query<{ workspace_id: string }>(
            "SELECT workspace_id FROM public.locations",
          );
          return rows;
        },
      );

      expect(viewFromA.every((r) => r.workspace_id === workspaceA)).toBe(true);
      expect(viewFromB.every((r) => r.workspace_id === workspaceB)).toBe(true);
      expect(viewFromA.some((r) => r.workspace_id === workspaceB)).toBe(false);
    } finally {
      await poolA.end();
      await poolB.end();
    }
  });

  it("fails closed: no workspace context set means zero tenant rows are visible", async () => {
    const connections = await openIndependentConnections(harness.appUri, 1);
    const appConn = connections[0]!;
    try {
      await appConn.query("BEGIN");
      // Deliberately no SET LOCAL app.workspace_id.
      const { rows } = await appConn.query("SELECT id FROM public.locations");
      expect(rows).toHaveLength(0);
      await appConn.query("ROLLBACK");
    } finally {
      await appConn.end();
    }
  });

  it("fails closed on write too: an insert with no workspace context is rejected by the RLS WITH CHECK", async () => {
    const connections = await openIndependentConnections(harness.appUri, 1);
    const appConn = connections[0]!;
    try {
      await appConn.query("BEGIN");
      await expect(
        appConn.query(
          `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'No Context HQ', 'Europe/Berlin')`,
          [workspaceA],
        ),
      ).rejects.toThrow(/row-level security/);
      await appConn.query("ROLLBACK");
    } finally {
      await appConn.end();
    }
  });

  it("correct workspace context allows the permitted access", async () => {
    const pool = new Pool({ connectionString: harness.appUri });
    try {
      const rows = await withWorkspaceContext(pool, { workspaceId: workspaceA }, async (tx) => {
        const { rows: r } = await tx.query(
          "SELECT id, name FROM public.locations WHERE name = 'A HQ'",
        );
        return r;
      });
      expect(rows).toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});
