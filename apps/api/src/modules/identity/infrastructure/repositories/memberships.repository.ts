/**
 * `identity.memberships` access (T034). `memberships` IS tenant-owned
 * (data-model.md), so ordinary access goes through `WorkspaceContextService`
 * (workspace-scoped by construction, FR-030). This repository has exactly one
 * method, and it is the documented FR-030 exception: "unscoped reads are
 * forbidden outside narrowly reviewed platform/admin tooling."
 *
 * `listActiveMembershipsForUser` answers "every active workspace this
 * signed-in user belongs to" -- inherently cross-workspace, needed by sign-in
 * (before any workspace is selected) and `GET /v1/me` (independent of
 * whichever workspace is active). It is scoped, not unscoped: it runs under
 * the additive `memberships_self_lookup` RLS policy
 * (`packages/db/migrations/0004_identity_membership_self_lookup.sql`), which
 * only ever matches `user_id = app.user_id` -- a value set here from an
 * already-authenticated identity, never from client input, in the same
 * transaction as the read. RLS is never bypassed (no `BYPASSRLS`, no
 * superuser, `app.workspace_id` is deliberately left unset so the ordinary
 * workspace-scoped policy contributes zero rows here).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../../platform/database/database.tokens.js";
import type { MembershipId, UserId, WorkspaceId } from "../../domain/ids.js";

export type MembershipRole = "owner" | "admin" | "manager" | "staff";

export interface ActiveMembershipView {
  readonly membershipId: MembershipId;
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
  readonly role: MembershipRole;
  readonly permissions: readonly string[];
}

interface ActiveMembershipRow {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  role: MembershipRole;
  permissions: string[];
}

export interface OwnMembershipInWorkspace {
  readonly membershipId: MembershipId;
  readonly workspaceId: WorkspaceId;
  readonly role: MembershipRole;
  readonly permissions: readonly string[];
  readonly membershipStatus: "active" | "suspended";
  readonly workspaceStatus: "active" | "suspended";
}

interface OwnMembershipRow {
  membership_id: string;
  workspace_id: string;
  role: MembershipRole;
  permissions: string[];
  membership_status: "active" | "suspended";
  workspace_status: "active" | "suspended";
}

@Injectable()
export class MembershipsRepository {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async listActiveMembershipsForUser(userId: UserId): Promise<readonly ActiveMembershipView[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const { rows } = await client.query<ActiveMembershipRow>(
        `SELECT m.id AS membership_id, m.workspace_id, w.name AS workspace_name, m.role, m.permissions
           FROM public.memberships m
           JOIN public.workspaces w ON w.id = m.workspace_id
          WHERE m.user_id = $1 AND m.status = 'active' AND w.status = 'active'
          ORDER BY w.name`,
        [userId],
      );
      await client.query("COMMIT");
      return rows.map((row) => ({
        membershipId: row.membership_id as MembershipId,
        workspaceId: row.workspace_id as WorkspaceId,
        workspaceName: row.workspace_name,
        role: row.role,
        permissions: row.permissions,
      }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * The T042 workspace-switch lookup: unlike {@link listActiveMembershipsForUser}
   * (active-only, cross-workspace), this needs to distinguish "no membership",
   * "suspended membership" and "suspended workspace" for ONE specific target
   * workspace, so it does not filter on status. Same narrow exception as
   * `listActiveMembershipsForUser`: runs under the additive
   * `memberships_self_lookup` SELECT-only policy (`app.user_id` only, never
   * `app.workspace_id`, never client-controlled) -- a nonexistent workspace and
   * a workspace the user does not belong to both resolve to `null`, so this
   * layer discloses nothing about workspace existence either (contracts/
   * workspace-context.contract.md: "reveals nothing about whether the
   * workspace exists").
   */
  async findOwnMembershipInWorkspace(
    userId: UserId,
    workspaceId: WorkspaceId,
  ): Promise<OwnMembershipInWorkspace | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const { rows } = await client.query<OwnMembershipRow>(
        `SELECT m.id AS membership_id, m.workspace_id, m.role, m.permissions,
                m.status AS membership_status, w.status AS workspace_status
           FROM public.memberships m
           JOIN public.workspaces w ON w.id = m.workspace_id
          WHERE m.user_id = $1 AND m.workspace_id = $2`,
        [userId, workspaceId],
      );
      await client.query("COMMIT");
      const row = rows[0];
      if (!row) return null;
      return {
        membershipId: row.membership_id as MembershipId,
        workspaceId: row.workspace_id as WorkspaceId,
        role: row.role,
        permissions: row.permissions,
        membershipStatus: row.membership_status,
        workspaceStatus: row.workspace_status,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
