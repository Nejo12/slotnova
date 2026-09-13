import type { Queryable } from "@slotnova/db";

/**
 * Versioned outbox payload. `requestId` is required so every event stays
 * traceable to the request/job that caused it (data-model.md "OutboxRecord",
 * FR-045); callers keep payloads PII-minimized (ADR-024) — this module does
 * not attempt to mechanically enforce that beyond the type boundary.
 */
export interface OutboxPayload extends Record<string, unknown> {
  readonly requestId: string;
}

export interface OutboxEventInput {
  readonly eventName: string;
  /** Starts at 1 (data-model.md). */
  readonly eventVersion?: number;
  /** Null/omitted for platform-level events with no single owning workspace. */
  readonly workspaceId?: string | null;
  readonly payload: OutboxPayload;
}

export interface OutboxRecord {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly payload: OutboxPayload;
  readonly occurredAt: Date;
  readonly availableAt: Date;
}

interface OutboxRow {
  id: string;
  workspace_id: string | null;
  event_name: string;
  event_version: number;
  payload: OutboxPayload;
  occurred_at: Date;
  available_at: Date;
}

/**
 * Insert one outbox row using the CALLER'S existing transaction client
 * (ADR-005, T022 critical invariant). This function never opens a second
 * transaction, never issues `BEGIN`/`COMMIT`/`ROLLBACK` itself, and never
 * runs on an independent pool query — `tx` must already be inside the same
 * transaction as the business state write it accompanies, so the two commit
 * or roll back together purely because they share one transaction.
 *
 * No delivery loop, retry, backoff, DLQ, scheduler or broker is implied by
 * this function — that is the worker (PR-16, ADR-005/014), out of scope here.
 */
export async function writeOutboxRecord(
  tx: Queryable,
  event: OutboxEventInput,
): Promise<OutboxRecord> {
  if (event.eventName.trim() === "") {
    throw new Error("writeOutboxRecord: eventName must not be blank");
  }
  const eventVersion = event.eventVersion ?? 1;
  if (!Number.isInteger(eventVersion) || eventVersion < 1) {
    throw new Error("writeOutboxRecord: eventVersion must be a positive integer");
  }

  const { rows } = await tx.query(
    `INSERT INTO public.outbox_records (workspace_id, event_name, event_version, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, workspace_id, event_name, event_version, payload, occurred_at, available_at`,
    [event.workspaceId ?? null, event.eventName, eventVersion, JSON.stringify(event.payload)],
  );

  const row = rows[0] as OutboxRow;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    eventName: row.event_name,
    eventVersion: row.event_version,
    payload: row.payload,
    occurredAt: new Date(row.occurred_at),
    availableAt: new Date(row.available_at),
  };
}
