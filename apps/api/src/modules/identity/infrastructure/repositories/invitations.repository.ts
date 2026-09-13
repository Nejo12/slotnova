import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient, Queryable } from "@slotnova/db";

import { DB_POOL } from "../../../platform/database/database.tokens.js";
import { setWorkspaceContext } from "../../../platform/tenancy/with-workspace-context.js";
import type { InvitationId, MembershipId, UserId, WorkspaceId } from "../../domain/ids.js";
import type { InvitableRole } from "../../domain/policy/default-role-permissions.js";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationRecord {
  readonly id: InvitationId;
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
  readonly email: string;
  readonly role: InvitableRole;
  readonly status: InvitationStatus;
  readonly expiresAt: Date;
}

interface InvitationRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: InvitableRole;
  status: InvitationStatus;
  expires_at: Date;
}

const INVITATION_SELECT = `
  SELECT i.id, i.workspace_id, ''::text AS workspace_name, i.email, i.role, i.status, i.expires_at
    FROM public.invitations i`;

function toInvitation(row: InvitationRow): InvitationRecord {
  return {
    id: row.id as InvitationId,
    workspaceId: row.workspace_id as WorkspaceId,
    workspaceName: row.workspace_name,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: new Date(row.expires_at),
  };
}

@Injectable()
export class InvitationTransactions {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async run<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      try {
        const result = await fn(tx);
        await tx.query("COMMIT");
        return result;
      } catch (error) {
        await tx.query("ROLLBACK");
        throw error;
      }
    } finally {
      tx.release();
    }
  }

  setWorkspace(
    tx: PoolClient,
    context: { workspaceId: string; userId?: string; requestId?: string },
  ): Promise<void> {
    return setWorkspaceContext(tx, context);
  }

  async setTokenLookup(tx: PoolClient, tokenHash: string): Promise<void> {
    await tx.query("SELECT set_config('app.invitation_token_hash', $1, true)", [tokenHash]);
  }
}

@Injectable()
export class InvitationsRepository {
  async findByTokenHash(
    tx: Queryable,
    tokenHash: string,
    lock: boolean,
  ): Promise<InvitationRecord | null> {
    const { rows } = await tx.query(
      `${INVITATION_SELECT} WHERE i.token_hash = $1${lock ? " FOR UPDATE OF i" : ""}`,
      [tokenHash],
    );
    const row = rows[0] as InvitationRow | undefined;
    return row ? toInvitation(row) : null;
  }

  async findWorkspaceName(tx: Queryable, workspaceId: WorkspaceId): Promise<string> {
    const { rows } = await tx.query("SELECT name FROM public.workspaces WHERE id = $1", [
      workspaceId,
    ]);
    const row = rows[0] as { name: string } | undefined;
    if (!row) throw new Error("invitation workspace is unavailable in its tenant context");
    return row.name;
  }

  async lockUserByEmail(tx: Queryable, email: string): Promise<UserId | null> {
    const { rows } = await tx.query("SELECT id FROM public.users WHERE email = $1 FOR UPDATE", [
      email,
    ]);
    return rows[0] ? ((rows[0] as { id: string }).id as UserId) : null;
  }

  async lockUserById(tx: Queryable, userId: UserId): Promise<void> {
    await tx.query("SELECT id FROM public.users WHERE id = $1 FOR UPDATE", [userId]);
  }

  async hasMembership(tx: Queryable, workspaceId: WorkspaceId, userId: UserId): Promise<boolean> {
    const { rows } = await tx.query(
      "SELECT 1 FROM public.memberships WHERE workspace_id = $1 AND user_id = $2 LIMIT 1",
      [workspaceId, userId],
    );
    return rows.length > 0;
  }

  async hasActiveMembership(
    tx: Queryable,
    workspaceId: WorkspaceId,
    userId: UserId,
  ): Promise<boolean> {
    const { rows } = await tx.query(
      `SELECT 1 FROM public.memberships
        WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
      [workspaceId, userId],
    );
    return rows.length > 0;
  }

  async createInvitation(
    tx: Queryable,
    input: {
      workspaceId: WorkspaceId;
      email: string;
      role: InvitableRole;
      tokenHash: string;
      expiresAt: Date;
      invitedBy: MembershipId;
    },
  ): Promise<InvitationRecord> {
    const { rows } = await tx.query(
      `INSERT INTO public.invitations
         (workspace_id, email, role, token_hash, expires_at, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, workspace_id, email, role, status, expires_at`,
      [
        input.workspaceId,
        input.email,
        input.role,
        input.tokenHash,
        input.expiresAt.toISOString(),
        input.invitedBy,
      ],
    );
    const row = rows[0] as Omit<InvitationRow, "workspace_name">;
    return toInvitation({ ...row, workspace_name: "" });
  }

  async createMembership(
    tx: Queryable,
    input: {
      workspaceId: WorkspaceId;
      userId: UserId;
      role: InvitableRole;
      permissions: readonly string[];
    },
  ): Promise<MembershipId> {
    const { rows } = await tx.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.workspaceId, input.userId, input.role, [...input.permissions]],
    );
    return (rows[0] as { id: string }).id as MembershipId;
  }

  async markAccepted(tx: Queryable, id: InvitationId, userId: UserId): Promise<void> {
    const result = await tx.query(
      `UPDATE public.invitations
          SET status = 'accepted', accepted_by_user_id = $2, updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [id, userId],
    );
    if ((result as { rowCount?: number }).rowCount !== 1) {
      throw new Error("invitation acceptance claim was lost");
    }
  }

  async revokePending(tx: Queryable, id: InvitationId): Promise<boolean> {
    const result = await tx.query(
      `UPDATE public.invitations SET status = 'revoked', updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [id],
    );
    return (result as { rowCount?: number }).rowCount === 1;
  }
}
