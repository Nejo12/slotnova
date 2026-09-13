import type { Queryable } from "@slotnova/db";

import type { AuditRecord, RecordAuditInput } from "../application/record-audit.port.js";

interface AuditRecordRow {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  request_id: string;
  occurred_at: Date;
}

function requireNonBlank(field: string, value: string): void {
  if (value.trim() === "") {
    throw new Error(`recordAudit: ${field} must not be blank`);
  }
}

/**
 * Insert one audit row using the CALLER'S existing transaction client. Never
 * opens a second transaction and never issues `BEGIN`/`COMMIT`/`ROLLBACK`
 * itself — an audit record's atomicity with the business change it describes
 * comes entirely from sharing the caller's transaction (same pattern as
 * `platform/outbox/outbox-writer.ts`, T022).
 *
 * There is no corresponding update/delete function in this module — audit
 * immutability is additionally enforced at the database-privilege level
 * (T031: the app role has no `UPDATE`/`DELETE` grant on `audit_records`).
 */
export async function recordAudit(tx: Queryable, input: RecordAuditInput): Promise<AuditRecord> {
  requireNonBlank("workspaceId", input.workspaceId);
  requireNonBlank("action", input.action);
  requireNonBlank("entityType", input.entityType);
  requireNonBlank("entityId", input.entityId);
  requireNonBlank("requestId", input.requestId);

  const { rows } = await tx.query(
    `INSERT INTO public.audit_records
       (workspace_id, actor_user_id, action, entity_type, entity_id, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata, request_id, occurred_at`,
    [
      input.workspaceId,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata ?? {}),
      input.requestId,
    ],
  );

  const row = rows[0] as AuditRecordRow;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    requestId: row.request_id,
    occurredAt: new Date(row.occurred_at),
  };
}
