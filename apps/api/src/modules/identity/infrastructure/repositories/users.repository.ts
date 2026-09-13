/**
 * `identity.users` access (T034). `users` is NOT tenant-owned (data-model.md
 * tenant-ownership matrix: "none" RLS, "platform-scoped repo (narrowly
 * reviewed)") -- there is no workspace to scope by, so this repository runs
 * plain queries against the shared pool rather than through
 * `WorkspaceContextService`. It is private to `identity` (never exported from
 * `identity/index.ts`) and is the only place that reads/writes this table.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../../platform/database/database.tokens.js";
import type { UserId } from "../../domain/ids.js";

export type UserStatus = "active" | "disabled";

export interface UserRecord {
  readonly id: UserId;
  readonly externalRef: string | null;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
}

interface UserRow {
  id: string;
  external_ref: string | null;
  email: string;
  display_name: string;
  status: UserStatus;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id as UserId,
    externalRef: row.external_ref,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
  };
}

const SELECT_COLUMNS = "id, external_ref, email, display_name, status";

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findByExternalRef(externalRef: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM public.users WHERE external_ref = $1`,
      [externalRef],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM public.users WHERE email = $1`,
      [email],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findById(id: UserId): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM public.users WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Links a previously-unlinked user to an adapter's `externalRef` (sign-in
   * resolution, T036/T038): only ever called when the row's `external_ref` is
   * currently `NULL`, so this can never silently reassign an existing link.
   */
  async linkExternalRef(id: UserId, externalRef: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.users SET external_ref = $2, updated_at = now()
       WHERE id = $1 AND external_ref IS NULL`,
      [id, externalRef],
    );
  }
}
