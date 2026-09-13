import type { Pool, PoolClient } from "@slotnova/db";

/**
 * The transaction-scoped tenant context every tenant-owned query runs under
 * (ADR-008, data-model.md "Tenant context contract"). `workspaceId` is
 * required — there is no "no context" state for tenant work, by construction.
 */
export interface WorkspaceContext {
  readonly workspaceId: string;
  readonly userId?: string;
  readonly requestId?: string;
}

/** Apply tenant context to an already-open transaction. */
export async function setWorkspaceContext(
  tx: PoolClient,
  context: WorkspaceContext,
): Promise<void> {
  await tx.query("SELECT set_config('app.workspace_id', $1, true)", [context.workspaceId]);
  if (context.userId !== undefined) {
    await tx.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
  }
  if (context.requestId !== undefined) {
    await tx.query("SELECT set_config('app.request_id', $1, true)", [context.requestId]);
  }
}

/**
 * Run `fn` inside a single transaction with `app.workspace_id` (and, when
 * supplied, `app.user_id` / `app.request_id`) set via `SET LOCAL` semantics
 * for that transaction only (data-model.md "Tenant context contract",
 * FR-028).
 *
 * Uses `SELECT set_config(name, value, true)` rather than a string-built
 * `SET LOCAL` statement: PostgreSQL's `SET`/`SET LOCAL` are utility commands
 * that do not accept bind parameters at all, so `set_config` is the only
 * parameter-safe way to set a session variable from user-influenced input
 * (`workspaceId`/`userId`/`requestId` are never concatenated into SQL text).
 *
 * Context and tenant work share exactly one transaction on exactly one
 * pooled client — required for correctness under a transaction-mode pooler
 * (research R1): `SET LOCAL`/`set_config(..., true)` is scoped to the current
 * transaction, so if context and queries ever ran on different connections
 * the setting would simply not be visible. Because the setting is
 * transaction-scoped, it is gone the instant this transaction ends
 * (commit or rollback) — even if the underlying physical connection is
 * later reused from the pool for an unrelated call.
 *
 * Commits on success, rolls back on any thrown error, and always releases
 * the client back to the pool.
 */
export async function withWorkspaceContext<T>(
  pool: Pool,
  context: WorkspaceContext,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await setWorkspaceContext(client, context);

      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
