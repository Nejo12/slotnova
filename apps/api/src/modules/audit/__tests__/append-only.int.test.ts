import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withWorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import { recordAudit } from "../infrastructure/audit-writer.js";

/**
 * T033 — audit append-only tests (real PostgreSQL). Proves the audit module's
 * one concrete invariant (FR-032, security-and-audit.md "Audit events"): the
 * app role can INSERT and SELECT `audit_records`, and PostgreSQL itself — not
 * merely the absence of an update/delete method on the write port — refuses
 * UPDATE and DELETE from that role.
 */
describe("audit append-only (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let actorUserId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    const ws = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Acme Studio', 'acme-audit-t033') RETURNING id`,
    );
    workspaceId = ws.rows[0]!.id;
    const otherWs = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Other Studio', 'other-audit-t033') RETURNING id`,
    );
    otherWorkspaceId = otherWs.rows[0]!.id;

    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('actor@example.test', 'Actor') RETURNING id`,
    );
    actorUserId = user.rows[0]!.id;

    pool = new Pool({ connectionString: harness.appUri });
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("inserts an audit record via recordAudit under correct workspace context", async () => {
    const record = await withWorkspaceContext(
      pool,
      { workspaceId, userId: actorUserId, requestId: "req-audit-1" },
      (tx) =>
        recordAudit(tx, {
          workspaceId,
          actorUserId,
          action: "membership.role_changed",
          entityType: "membership",
          entityId: "11111111-1111-1111-1111-111111111111",
          metadata: { from: "staff", to: "manager" },
          requestId: "req-audit-1",
        }),
    );

    expect(record.id).toBeDefined();
    expect(record.workspaceId).toBe(workspaceId);
    expect(record.action).toBe("membership.role_changed");
  });

  it("SELECT is workspace-scoped: a workspace only sees its own audit records", async () => {
    await withWorkspaceContext(pool, { workspaceId, requestId: "req-audit-2" }, (tx) =>
      recordAudit(tx, {
        workspaceId,
        action: "invitation.issued",
        entityType: "invitation",
        entityId: "22222222-2222-2222-2222-222222222222",
        requestId: "req-audit-2",
      }),
    );
    await withWorkspaceContext(
      pool,
      { workspaceId: otherWorkspaceId, requestId: "req-audit-3" },
      (tx) =>
        recordAudit(tx, {
          workspaceId: otherWorkspaceId,
          action: "invitation.issued",
          entityType: "invitation",
          entityId: "33333333-3333-3333-3333-333333333333",
          requestId: "req-audit-3",
        }),
    );

    const seenFromWorkspace = await withWorkspaceContext(pool, { workspaceId }, async (tx) => {
      const { rows } = await tx.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM public.audit_records",
      );
      return rows;
    });

    expect(seenFromWorkspace.length).toBeGreaterThan(0);
    expect(seenFromWorkspace.every((r) => r.workspace_id === workspaceId)).toBe(true);
  });

  it("denies UPDATE to the app role — PostgreSQL itself refuses it, not just the missing port method", async () => {
    const appConn = new Client({ connectionString: harness.appUri });
    await appConn.connect();
    try {
      await appConn.query("BEGIN");
      await appConn.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
      await expect(
        appConn.query(
          "UPDATE public.audit_records SET action = 'tampered' WHERE workspace_id = $1",
          [workspaceId],
        ),
      ).rejects.toThrow(/permission denied for table audit_records/);
      await appConn.query("ROLLBACK");
    } finally {
      await appConn.end();
    }
  });

  it("denies DELETE to the app role — PostgreSQL itself refuses it, not just the missing port method", async () => {
    const appConn = new Client({ connectionString: harness.appUri });
    await appConn.connect();
    try {
      await appConn.query("BEGIN");
      await appConn.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
      await expect(
        appConn.query("DELETE FROM public.audit_records WHERE workspace_id = $1", [workspaceId]),
      ).rejects.toThrow(/permission denied for table audit_records/);
      await appConn.query("ROLLBACK");
    } finally {
      await appConn.end();
    }
  });

  it("rejects a blank action before touching the database", async () => {
    await withWorkspaceContext(pool, { workspaceId }, async (tx) => {
      await expect(
        recordAudit(tx, {
          workspaceId,
          action: "  ",
          entityType: "membership",
          entityId: "44444444-4444-4444-4444-444444444444",
          requestId: "req-audit-4",
        }),
      ).rejects.toThrow(/action must not be blank/);
    });
  });
});
