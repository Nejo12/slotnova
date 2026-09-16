/**
 * Durable, provider-neutral HTTP mutation-idempotency primitive (issue #61,
 * correctness repair).
 *
 * ## Supported contract — same-transaction execution ONLY
 *
 * `executeIdempotently(tx, scope, fn)` is the only entry point this module
 * exposes. The claim, the caller's business mutation (`fn`), and the
 * completion write all happen inside ONE caller-supplied database
 * transaction (`tx` — ordinarily the `PoolClient` a `withWorkspaceContext`
 * callback already runs on, exactly like `writeOutboxRecord` takes the
 * caller's transaction rather than opening its own).
 *
 * This module does **not** support, and must not be extended to support
 * without its own separately reviewed design:
 * - a claim committed separately from its completion
 * - an external-provider call (or any other non-transactional side effect)
 *   between claim and completion
 * - lease/claim expiry or "abandoned claim" takeover
 * - any generic distributed request-lock behavior
 *
 * An earlier revision of this module offered exactly that split-transaction
 * lease/reclaim capability. Independent review found it unsafe: caller A
 * claims, A's lease expires, caller B legitimately reclaims and completes
 * the same record, and A — unaware it lost ownership — can still call a
 * bare `complete(recordId, ...)` and overwrite B's result with a stale one,
 * because completion was keyed only on `id` + a status flag, not on which
 * caller actually holds the claim. Removing the capability entirely (rather
 * than trying to patch the fencing) is deliberate: no current consumer
 * needs it, and a future endpoint whose protected mutation cannot fit in
 * one database transaction must get its own reviewed idempotency design
 * rather than reusing this one degraded to accommodate it.
 *
 * ## Why the same-transaction model is safe under true concurrency
 *
 * `attemptClaim` below issues `INSERT ... ON CONFLICT DO NOTHING`. When a
 * concurrent transaction has already inserted (but not yet committed) a row
 * for the same `(workspace_id, operation, idempotency_key)`, PostgreSQL
 * blocks our `INSERT` until that other transaction resolves — this is
 * ordinary unique-index conflict behavior, not application-level locking.
 * Once unblocked:
 * - if the other transaction **committed**, our insert affects zero rows;
 *   we then read its row, which is guaranteed fully completed (this
 *   module's own transaction never commits between claiming and completing
 *   — a thrown `fn()` rolls the whole transaction, claim included, back
 *   with it) — so what we read is always a valid replay target, never a
 *   partially-written row.
 * - if the other transaction **rolled back** (its `fn()` threw, or any
 *   other failure before commit), our insert succeeds normally and we
 *   proceed to run `fn()` ourselves.
 *
 * This is why no `FOR UPDATE`, lease, or explicit lock is needed: Postgres's
 * own transactional visibility rules are the entire correctness mechanism.
 */
import type { Queryable } from "@slotnova/db";

import { IdempotencyConflictError } from "./idempotency-errors.js";

export interface IdempotencyScope {
  readonly workspaceId: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
  readonly contentType?: string;
}

export interface ExecuteIdempotentlyResult {
  /** `true` if this call returned a previously-completed result rather than running `fn`. */
  readonly replayed: boolean;
  readonly response: StoredResponse;
}

interface IdempotentRequestRow {
  id: string;
  request_fingerprint: string;
  response_status: number | null;
  response_body: unknown;
  response_content_type: string;
}

type ClaimAttempt =
  | { readonly outcome: "claimed"; readonly recordId: string }
  | { readonly outcome: "existing"; readonly row: IdempotentRequestRow };

/**
 * Internal — never exported. See the module doc: a row this function
 * observes as "existing" is always a committed, fully-completed row, never
 * a partially-claimed one, because nothing in this module ever commits a
 * claim without also having completed it first.
 */
async function attemptClaim(tx: Queryable, scope: IdempotencyScope): Promise<ClaimAttempt> {
  const inserted = await tx.query(
    `INSERT INTO public.idempotent_requests
       (workspace_id, operation, idempotency_key, request_fingerprint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, operation, idempotency_key) DO NOTHING
     RETURNING id`,
    [scope.workspaceId, scope.operation, scope.idempotencyKey, scope.requestFingerprint],
  );
  const insertedRow = inserted.rows[0] as { id: string } | undefined;
  if (insertedRow) {
    return { outcome: "claimed", recordId: insertedRow.id };
  }

  const { rows } = await tx.query(
    `SELECT id, request_fingerprint, response_status, response_body, response_content_type
       FROM public.idempotent_requests
      WHERE workspace_id = $1 AND operation = $2 AND idempotency_key = $3`,
    [scope.workspaceId, scope.operation, scope.idempotencyKey],
  );
  const existing = rows[0] as IdempotentRequestRow | undefined;
  if (!existing) {
    // The conflicting row's owning transaction rolled back between our
    // INSERT and this SELECT -- the key is free again. Retry once.
    return attemptClaim(tx, scope);
  }
  return { outcome: "existing", row: existing };
}

/** Internal — never exported. Always called before the claiming transaction commits. */
async function markCompleted(
  tx: Queryable,
  recordId: string,
  response: StoredResponse,
): Promise<void> {
  await tx.query(
    `UPDATE public.idempotent_requests
        SET response_status = $2, response_body = $3::jsonb, response_content_type = $4,
            completed_at = now()
      WHERE id = $1`,
    [
      recordId,
      response.status,
      JSON.stringify(response.body ?? null),
      response.contentType ?? "application/json",
    ],
  );
}

/**
 * Runs `fn` at most once per `scope` (workspace + operation + idempotency
 * key + request fingerprint), with the claim, `fn`, and the completion
 * write all inside `tx`. Throws {@link IdempotencyConflictError} if the same
 * key/scope was already used with a materially different request. See the
 * module doc for the concurrency/atomicity model.
 */
export async function executeIdempotently(
  tx: Queryable,
  scope: IdempotencyScope,
  fn: () => Promise<StoredResponse>,
): Promise<ExecuteIdempotentlyResult> {
  const attempt = await attemptClaim(tx, scope);

  if (attempt.outcome === "existing") {
    if (attempt.row.request_fingerprint !== scope.requestFingerprint) {
      throw new IdempotencyConflictError(scope.operation, scope.idempotencyKey);
    }
    return {
      replayed: true,
      response: {
        status: attempt.row.response_status!,
        body: attempt.row.response_body,
        contentType: attempt.row.response_content_type,
      },
    };
  }

  const rawResponse = await fn();
  // Normalized to the same shape a replay produces (contentType always
  // present) so a caller cannot observe a difference between "I just ran
  // this" and "this was replayed".
  const response: StoredResponse = {
    status: rawResponse.status,
    body: rawResponse.body,
    contentType: rawResponse.contentType ?? "application/json",
  };
  await markCompleted(tx, attempt.recordId, response);
  return { replayed: false, response };
}
