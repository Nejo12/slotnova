/**
 * Durable, provider-neutral HTTP mutation-idempotency primitive (issue #61).
 * Knows nothing about Catalog, Booking, Payments, or any other business
 * concept — only an opaque `operation` scope string, a caller-supplied
 * `idempotencyKey`, and a request fingerprint (`request-fingerprint.ts`).
 *
 * ## Transaction model (the design's core guarantee)
 *
 * `executeIdempotently` runs the claim, the caller's business logic, and the
 * completion write inside the SAME caller-supplied transaction (`tx` —
 * ordinarily the `PoolClient` a `withWorkspaceContext` callback already runs
 * on, exactly like `writeOutboxRecord` takes the caller's transaction rather
 * than opening its own). Because all three steps share one transaction:
 *
 * - a crash/exception before `COMMIT` rolls back the claim together with
 *   the business write — there is never a *committed* `in_progress` row
 *   left behind by this path, so nothing is "poisoned" by a mid-transaction
 *   failure.
 * - a concurrent duplicate's claim attempt (`INSERT ... ON CONFLICT`) blocks
 *   on Postgres's own unique-index conflict resolution until the first
 *   transaction commits or rolls back, then deterministically sees either
 *   nothing (first transaction rolled back — it may now claim and execute)
 *   or the first transaction's committed, completed row (it replays).
 *
 * `claim`/`complete` are exported separately for a future consumer whose
 * business logic cannot fit in one transaction (e.g. an external provider
 * call between claim and completion — not needed by Catalog PR-02, which
 * uses `executeIdempotently` directly). For that split-transaction case, an
 * `in_progress` row CAN be durably committed on its own, so `lease_expires_at`
 * bounds how long it blocks a retry before another caller may reclaim it —
 * a documented, bounded recovery path, not a distributed-lock framework.
 */
import type { Queryable } from "@slotnova/db";

import { IdempotencyConflictError, IdempotencyInProgressError } from "./idempotency-errors.js";

const DEFAULT_LEASE_MS = 30_000;

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

export type ClaimResult =
  | { readonly outcome: "claimed"; readonly recordId: string }
  | { readonly outcome: "replay"; readonly response: StoredResponse }
  | { readonly outcome: "conflict" }
  | { readonly outcome: "in-progress" };

interface IdempotentRequestRow {
  id: string;
  request_fingerprint: string;
  status: "in_progress" | "completed";
  response_status: number | null;
  response_body: unknown;
  response_content_type: string;
  lease_expires_at: string;
}

/**
 * Attempts to acquire ownership of `scope.idempotencyKey` within
 * `scope.operation`/`scope.workspaceId`. See the module doc for the full
 * outcome/recovery semantics.
 */
export async function claim(
  tx: Queryable,
  scope: IdempotencyScope,
  leaseDurationMs: number = DEFAULT_LEASE_MS,
): Promise<ClaimResult> {
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

  const inserted = await tx.query(
    `INSERT INTO public.idempotent_requests
       (workspace_id, operation, idempotency_key, request_fingerprint, status, lease_expires_at)
     VALUES ($1, $2, $3, $4, 'in_progress', $5)
     ON CONFLICT (workspace_id, operation, idempotency_key) DO NOTHING
     RETURNING id`,
    [
      scope.workspaceId,
      scope.operation,
      scope.idempotencyKey,
      scope.requestFingerprint,
      leaseExpiresAt,
    ],
  );
  const insertedRow = inserted.rows[0] as { id: string } | undefined;
  if (insertedRow) {
    return { outcome: "claimed", recordId: insertedRow.id };
  }

  // A conflicting row exists (or existed a moment ago, if the owner just
  // rolled back) -- lock it so a concurrent reclaim attempt serializes
  // against this decision rather than racing it.
  const { rows } = await tx.query(
    `SELECT id, request_fingerprint, status, response_status, response_body,
            response_content_type, lease_expires_at
       FROM public.idempotent_requests
      WHERE workspace_id = $1 AND operation = $2 AND idempotency_key = $3
      FOR UPDATE`,
    [scope.workspaceId, scope.operation, scope.idempotencyKey],
  );
  const existing = rows[0] as IdempotentRequestRow | undefined;
  if (!existing) {
    // The conflicting row was rolled back between our INSERT and this SELECT
    // (its owning transaction aborted). Retry once -- the key is free now.
    return claim(tx, scope, leaseDurationMs);
  }

  if (existing.request_fingerprint !== scope.requestFingerprint) {
    return { outcome: "conflict" };
  }

  if (existing.status === "completed") {
    return {
      outcome: "replay",
      response: {
        status: existing.response_status!,
        body: existing.response_body,
        contentType: existing.response_content_type,
      },
    };
  }

  const leaseExpired = new Date(existing.lease_expires_at).getTime() <= Date.now();
  if (!leaseExpired) {
    return { outcome: "in-progress" };
  }

  // Bounded recovery: the previous owner's lease expired without completing
  // (its process died after committing the claim in a split-transaction
  // usage). Reclaim by bumping the lease, guarded by the previous lease
  // value so only one concurrent reclaimer wins the race.
  const reclaimed = await tx.query(
    `UPDATE public.idempotent_requests
        SET lease_expires_at = $1
      WHERE id = $2 AND status = 'in_progress' AND lease_expires_at = $3
      RETURNING id`,
    [leaseExpiresAt, existing.id, existing.lease_expires_at],
  );
  const reclaimedRow = reclaimed.rows[0] as { id: string } | undefined;
  if (reclaimedRow) {
    return { outcome: "claimed", recordId: reclaimedRow.id };
  }
  // Someone else reclaimed or completed it in the interim -- re-evaluate.
  return claim(tx, scope, leaseDurationMs);
}

/** Marks a claimed record completed with its durable, replayable response. */
export async function complete(
  tx: Queryable,
  recordId: string,
  response: StoredResponse,
): Promise<void> {
  await tx.query(
    `UPDATE public.idempotent_requests
        SET status = 'completed', response_status = $2, response_body = $3::jsonb,
            response_content_type = $4, completed_at = now()
      WHERE id = $1 AND status = 'in_progress'`,
    [
      recordId,
      response.status,
      JSON.stringify(response.body ?? null),
      response.contentType ?? "application/json",
    ],
  );
}

export interface ExecuteIdempotentlyResult {
  /** `true` if this call returned a previously-completed result rather than running `fn`. */
  readonly replayed: boolean;
  readonly response: StoredResponse;
}

/**
 * Runs `fn` at most once per `scope` (workspace + operation + idempotency
 * key + request fingerprint), inside `tx`. Throws {@link IdempotencyConflictError}
 * if the same key/scope was already used with a materially different
 * request, or {@link IdempotencyInProgressError} if another still-live
 * execution currently owns the key. See the module doc for the transaction
 * model that makes this safe under true concurrency.
 */
export async function executeIdempotently(
  tx: Queryable,
  scope: IdempotencyScope,
  fn: () => Promise<StoredResponse>,
  leaseDurationMs?: number,
): Promise<ExecuteIdempotentlyResult> {
  const result = await claim(tx, scope, leaseDurationMs);

  if (result.outcome === "conflict") {
    throw new IdempotencyConflictError(scope.operation, scope.idempotencyKey);
  }
  if (result.outcome === "in-progress") {
    throw new IdempotencyInProgressError(scope.operation, scope.idempotencyKey);
  }
  if (result.outcome === "replay") {
    return { replayed: true, response: result.response };
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
  await complete(tx, result.recordId, response);
  return { replayed: false, response };
}
