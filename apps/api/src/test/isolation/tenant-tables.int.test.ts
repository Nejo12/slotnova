/**
 * T040 -- cross-tenant isolation, parameterized over every current
 * tenant-owned foundation table (data-model.md tenant-ownership matrix):
 * `locations`, `memberships`, `invitations`, `audit_records`. Proves RLS
 * coverage plus read/write isolation even when the SQL text itself
 * deliberately omits a `workspace_id` predicate (ADR-008, FR-033, SC-004).
 * No mocks; real PostgreSQL throughout.
 */
import { Client, Pool, type PoolClient } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  assertRlsCoverage,
  startPostgres,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { runMigrations } from "@slotnova/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface WorkspaceFixture {
  readonly workspaceId: string;
  readonly membershipId: string;
  readonly locationId: string;
  readonly invitationId: string;
  readonly auditRecordId: string;
}

interface TenantTableCase {
  readonly table: string;
  readonly supportsUpdate: boolean;
  readonly updateColumn: string | null;
  readonly updateValue: string | null;
  rowIdFor(fixture: WorkspaceFixture): string;
}

const TABLE_CASES: readonly TenantTableCase[] = [
  {
    table: "locations",
    supportsUpdate: true,
    updateColumn: "name",
    updateValue: "hacked-name",
    rowIdFor: (f) => f.locationId,
  },
  {
    table: "memberships",
    supportsUpdate: true,
    updateColumn: "role",
    // Every fixture's seeded membership role is "owner" (seedWorkspaceFixture
    // always inserts the fixture's owner), so the attack value here must
    // differ from that or the post-update "unchanged" assertion below would
    // trivially match the legitimate seed value even if RLS had failed to
    // block the write.
    updateValue: "admin",
    rowIdFor: (f) => f.membershipId,
  },
  {
    table: "invitations",
    supportsUpdate: true,
    updateColumn: "role",
    updateValue: "owner",
    rowIdFor: (f) => f.invitationId,
  },
  {
    table: "audit_records",
    // No UPDATE/DELETE grant exists for anyone on this table (append-only
    // at the DB-privilege level, T032/0003_audit.sql) -- that non-mutability
    // is already proven by audit/__tests__/append-only.int.test.ts; this
    // suite's job is tenant READ/INSERT isolation, which still applies.
    supportsUpdate: false,
    updateColumn: null,
    updateValue: null,
    rowIdFor: (f) => f.auditRecordId,
  },
];

async function withRawContext<T>(
  pool: Pool,
  workspaceId: string | null,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (workspaceId !== null) {
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

describe("cross-tenant table isolation (real PostgreSQL, T040)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let fixtureA: WorkspaceFixture;
  let fixtureB: WorkspaceFixture;

  async function seedWorkspaceFixture(label: string): Promise<WorkspaceFixture> {
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`T040 ${label}`, `t040-${label}-${Date.now()}`],
    );
    const workspaceId = workspace.rows[0]!.id;

    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ($1, 'T040 Owner') RETURNING id`,
      [`t040-${label}-${Date.now()}@example.test`],
    );

    const membership = await admin.query<{ id: string }>(
      `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner') RETURNING id`,
      [workspaceId, user.rows[0]!.id],
    );

    const location = await admin.query<{ id: string }>(
      `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'Studio', 'Europe/Berlin') RETURNING id`,
      [workspaceId],
    );

    const invitation = await admin.query<{ id: string }>(
      `INSERT INTO public.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
       VALUES ($1, $2, 'staff', $3, now() + interval '7 days', $4) RETURNING id`,
      [
        workspaceId,
        `invitee-${label}@example.test`,
        `hash-${label}-${Date.now()}`,
        membership.rows[0]!.id,
      ],
    );

    const auditRecord = await admin.query<{ id: string }>(
      `INSERT INTO public.audit_records (workspace_id, action, entity_type, entity_id, request_id)
       VALUES ($1, 'test.seeded', 'test', 'entity-1', $2) RETURNING id`,
      [workspaceId, `req-${label}`],
    );

    return {
      workspaceId,
      membershipId: membership.rows[0]!.id,
      locationId: location.rows[0]!.id,
      invitationId: invitation.rows[0]!.id,
      auditRecordId: auditRecord.rows[0]!.id,
    };
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });

    fixtureA = await seedWorkspaceFixture("a");
    fixtureB = await seedWorkspaceFixture("b");
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("has RLS enabled + forced + policy on every tenant-owned foundation table", async () => {
    await expect(
      assertRlsCoverage(
        admin,
        TABLE_CASES.map((c) => ({ schema: "public", table: c.table })),
      ),
    ).resolves.toHaveLength(TABLE_CASES.length);
  });

  describe.each(TABLE_CASES)("$table", (tableCase) => {
    it("a query with NO workspace_id predicate at all, under workspace A's context, sees only A's row", async () => {
      const rows = await withRawContext(pool, fixtureA.workspaceId, (tx) =>
        tx.query<{ workspace_id: string }>(`SELECT workspace_id FROM public.${tableCase.table}`),
      );
      expect(rows.rows.length).toBeGreaterThan(0);
      expect(rows.rows.every((r) => r.workspace_id === fixtureA.workspaceId)).toBe(true);
      expect(rows.rows.some((r) => r.workspace_id === fixtureB.workspaceId)).toBe(false);
    });

    it("a query with NO workspace context set at all sees zero rows (fail closed), even though data exists", async () => {
      const rows = await withRawContext(pool, null, (tx) =>
        tx.query(`SELECT id FROM public.${tableCase.table}`),
      );
      expect(rows.rows).toHaveLength(0);
    });

    it("cannot INSERT a row claiming the other workspace's id while context is set to A (WITH CHECK)", async () => {
      await expect(
        withRawContext(pool, fixtureA.workspaceId, async (tx) => {
          if (tableCase.table === "locations") {
            await tx.query(
              `INSERT INTO public.locations (workspace_id, name, timezone) VALUES ($1, 'Should Fail', 'Europe/Berlin')`,
              [fixtureB.workspaceId],
            );
          } else if (tableCase.table === "memberships") {
            const rogueUser = await admin.query<{ id: string }>(
              `INSERT INTO public.users (email, display_name) VALUES ($1, 'Rogue') RETURNING id`,
              [`rogue-${Date.now()}@example.test`],
            );
            await tx.query(
              `INSERT INTO public.memberships (workspace_id, user_id, role) VALUES ($1, $2, 'staff')`,
              [fixtureB.workspaceId, rogueUser.rows[0]!.id],
            );
          } else if (tableCase.table === "invitations") {
            await tx.query(
              `INSERT INTO public.invitations (workspace_id, email, role, token_hash, expires_at, invited_by)
               VALUES ($1, 'rogue-invitee@example.test', 'staff', $2, now() + interval '7 days', $3)`,
              [fixtureB.workspaceId, `rogue-hash-${Date.now()}`, fixtureB.membershipId],
            );
          } else {
            await tx.query(
              `INSERT INTO public.audit_records (workspace_id, action, entity_type, entity_id, request_id)
               VALUES ($1, 'test.rogue', 'test', 'entity-x', 'req-rogue')`,
              [fixtureB.workspaceId],
            );
          }
        }),
      ).rejects.toThrow(/row-level security/i);
    });

    if (tableCase.supportsUpdate) {
      it("cannot UPDATE the other workspace's row even with no workspace_id predicate in the WHERE clause", async () => {
        const targetRowId = tableCase.rowIdFor(fixtureB);
        const result = await withRawContext(pool, fixtureA.workspaceId, (tx) =>
          tx.query(
            `UPDATE public.${tableCase.table} SET ${tableCase.updateColumn} = $1 WHERE id = $2`,
            [tableCase.updateValue, targetRowId],
          ),
        );
        expect(result.rowCount).toBe(0);

        // Confirm workspace B's row is genuinely unchanged, read back under
        // B's own context.
        const targetColumn = tableCase.updateColumn as string;
        const after = await withRawContext(pool, fixtureB.workspaceId, (tx) =>
          tx.query<Record<string, unknown>>(
            `SELECT ${targetColumn} FROM public.${tableCase.table} WHERE id = $1`,
            [targetRowId],
          ),
        );
        expect(after.rows[0]?.[targetColumn]).not.toEqual(tableCase.updateValue);
      });
    }
  });
});
