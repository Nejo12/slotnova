/**
 * `identity.sessions` access (T034). NOT tenant-owned (data-model.md: keyed
 * by user, no RLS) -- plain queries against the shared pool, same reasoning
 * as `users.repository.ts`. Private to `identity`; the session service
 * (T036) is the only caller.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../../platform/database/database.tokens.js";
import type { SessionId, UserId, WorkspaceId } from "../../domain/ids.js";

export interface SessionRecord {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly activeWorkspaceId: WorkspaceId | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly rotatedFrom: SessionId | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  active_workspace_id: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  rotated_from: string | null;
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id as SessionId,
    userId: row.user_id as UserId,
    activeWorkspaceId: row.active_workspace_id as WorkspaceId | null,
    createdAt: new Date(row.created_at),
    lastSeenAt: new Date(row.last_seen_at),
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    rotatedFrom: row.rotated_from as SessionId | null,
  };
}

const SELECT_COLUMNS =
  "id, user_id, active_workspace_id, created_at, last_seen_at, expires_at, revoked_at, rotated_from";

export interface InsertSessionInput {
  /** The already-hashed lookup value (`domain/session-token.ts`), never the raw token. */
  readonly hashedId: string;
  readonly userId: UserId;
  readonly activeWorkspaceId: WorkspaceId | null;
  readonly expiresAt: Date;
  readonly rotatedFrom: SessionId | null;
  readonly clientHint: Readonly<Record<string, unknown>>;
}

@Injectable()
export class SessionsRepository {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async insert(input: InsertSessionInput): Promise<SessionRecord> {
    const { rows } = await this.pool.query<SessionRow>(
      `INSERT INTO public.sessions (id, user_id, active_workspace_id, expires_at, rotated_from, client_hint)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.hashedId,
        input.userId,
        input.activeWorkspaceId,
        input.expiresAt.toISOString(),
        input.rotatedFrom,
        JSON.stringify(input.clientHint),
      ],
    );
    return toRecord(rows[0] as SessionRow);
  }

  /**
   * Fails closed by construction: a revoked, expired, or missing session
   * never comes back from this query (ADR-007 "fail closed"), so callers
   * never need to re-check `revokedAt`/`expiresAt` themselves.
   */
  async findActiveByHashedId(hashedId: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT ${SELECT_COLUMNS} FROM public.sessions
        WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hashedId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async touchLastSeen(hashedId: string): Promise<void> {
    await this.pool.query(`UPDATE public.sessions SET last_seen_at = now() WHERE id = $1`, [
      hashedId,
    ]);
  }

  /** Idempotent: revoking an already-revoked or nonexistent session is a no-op. */
  async revoke(hashedId: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [hashedId],
    );
  }

  /**
   * Atomically supersedes an active session with a freshly issued one
   * (review correction: `SessionService.rotate` previously revoked and
   * inserted through two separate pool calls, which was not one transaction
   * and could leave a revoked session with no successor). Both writes run on
   * ONE client inside ONE `BEGIN`/`COMMIT` — if the insert fails, the
   * `ROLLBACK` undoes the revoke too, so the original session is left valid.
   *
   * The conditional `UPDATE ... WHERE revoked_at IS NULL AND expires_at >
   * now()` is itself the serialization point: PostgreSQL takes a row lock for
   * the duration of an `UPDATE`, so two concurrent callers rotating the SAME
   * session serialize on that row — whichever commits first leaves
   * `revoked_at` set, so the loser's `WHERE` clause matches zero rows on its
   * turn and it gets `null` back, never a second successor. No explicit
   * `SELECT ... FOR UPDATE` or application-level lock is needed.
   *
   * `buildNext` receives the just-revoked (previous) session so the caller
   * can carry forward `userId`/`activeWorkspaceId` (or override the latter)
   * and set `rotatedFrom` — all decided from data read inside this same
   * transaction, not a separate round trip.
   */
  async rotateAtomically(
    currentHashedId: string,
    buildNext: (previous: SessionRecord) => InsertSessionInput,
  ): Promise<{ readonly previous: SessionRecord; readonly next: SessionRecord } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const revoked = await client.query<SessionRow>(
        `UPDATE public.sessions
            SET revoked_at = now()
          WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()
        RETURNING ${SELECT_COLUMNS}`,
        [currentHashedId],
      );
      if (revoked.rowCount === 0) {
        // Nothing to roll back -- the UPDATE matched no row, so this
        // transaction made no change. Still end it explicitly rather than
        // leaving the connection mid-transaction when it returns to the pool.
        await client.query("ROLLBACK");
        return null;
      }

      const previous = toRecord(revoked.rows[0] as SessionRow);
      const next = buildNext(previous);

      const inserted = await client.query<SessionRow>(
        `INSERT INTO public.sessions (id, user_id, active_workspace_id, expires_at, rotated_from, client_hint)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING ${SELECT_COLUMNS}`,
        [
          next.hashedId,
          next.userId,
          next.activeWorkspaceId,
          next.expiresAt.toISOString(),
          next.rotatedFrom,
          JSON.stringify(next.clientHint),
        ],
      );

      await client.query("COMMIT");
      return { previous, next: toRecord(inserted.rows[0] as SessionRow) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
