import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UserId, WorkspaceId } from "../../../domain/ids.js";
import { SessionsRepository } from "../../../infrastructure/repositories/sessions.repository.js";
import { SessionService } from "../session.service.js";

/**
 * T036 -- session service issue/validate/rotate/revoke against real
 * PostgreSQL (ADR-007, research R7): server-authoritative expiry, fail-closed
 * validation, rotation chains, idempotent revoke, and the "old cookie never
 * becomes usable again" sign-out invariant (contracts/session.contract.md).
 */
describe("SessionService (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let service: SessionService;
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });
    service = new SessionService(new SessionsRepository(pool));

    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name) VALUES ('session-svc@example.test', 'Session Svc') RETURNING id`,
    );
    userId = user.rows[0]!.id;
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Session Svc WS', 'session-svc-ws') RETURNING id`,
    );
    workspaceId = workspace.rows[0]!.id;
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("issues a session whose raw token is never the persisted lookup value", async () => {
    const { rawToken, session } = await service.issue({
      userId: userId as UserId,
      activeWorkspaceId: workspaceId as WorkspaceId,
    });
    expect(rawToken).toBeTruthy();
    expect(session.id).not.toEqual(rawToken);

    const row = await admin.query<{ id: string }>(`SELECT id FROM public.sessions WHERE id = $1`, [
      session.id,
    ]);
    expect(row.rows).toHaveLength(1);
  });

  it("validates a freshly issued session and returns null for a bogus token", async () => {
    const { rawToken } = await service.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });

    const validated = await service.validate(rawToken);
    expect(validated?.userId).toEqual(userId);

    expect(await service.validate("not-a-real-token")).toBeNull();
  });

  it("fails closed for an expired session even though the row still exists", async () => {
    const { rawToken, session } = await service.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    await admin.query(
      `UPDATE public.sessions SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [session.id],
    );
    expect(await service.validate(rawToken)).toBeNull();
  });

  it("revoke is idempotent and the old cookie never becomes usable again", async () => {
    const { rawToken } = await service.issue({
      userId: userId as UserId,
      activeWorkspaceId: null,
    });
    expect(await service.validate(rawToken)).not.toBeNull();

    await service.revoke(rawToken);
    expect(await service.validate(rawToken)).toBeNull();

    // Idempotent: revoking again does not throw.
    await expect(service.revoke(rawToken)).resolves.toBeUndefined();
    expect(await service.validate(rawToken)).toBeNull();
  });

  it("revoking an unknown token never throws", async () => {
    await expect(service.revoke("never-issued-token")).resolves.toBeUndefined();
  });

  it("rotate supersedes the old session: old token invalid, new token valid, chain recorded", async () => {
    const first = await service.issue({
      userId: userId as UserId,
      activeWorkspaceId: workspaceId as WorkspaceId,
    });

    const rotated = await service.rotate(first.rawToken);
    expect(rotated).not.toBeNull();
    expect(rotated?.session.rotatedFrom).toEqual(first.session.id);
    expect(rotated?.rawToken).not.toEqual(first.rawToken);

    expect(await service.validate(first.rawToken)).toBeNull();
    const revalidated = await service.validate(rotated!.rawToken);
    expect(revalidated?.userId).toEqual(userId);
    expect(revalidated?.activeWorkspaceId).toEqual(workspaceId);
  });

  it("rotate can change the active workspace (future workspace-switch callers)", async () => {
    const first = await service.issue({
      userId: userId as UserId,
      activeWorkspaceId: workspaceId as WorkspaceId,
    });

    const otherWorkspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Session Svc WS Two', 'session-svc-ws-two') RETURNING id`,
    );
    const otherWorkspaceId = otherWorkspace.rows[0]!.id;

    const rotated = await service.rotate(first.rawToken, {
      activeWorkspaceId: otherWorkspaceId as WorkspaceId,
    });
    expect(rotated?.session.activeWorkspaceId).toEqual(otherWorkspaceId);
  });

  it("rotate returns null and has no side effect for an already-invalid token", async () => {
    expect(await service.rotate("never-issued-token")).toBeNull();
  });
});
