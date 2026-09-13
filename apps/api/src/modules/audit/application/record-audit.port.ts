/**
 * The `audit` module's only write surface (T032). Other modules call
 * {@link RecordAudit} — never `audit_records` directly (constitution III;
 * data-model.md module-ownership).
 *
 * Deliberately narrow: append-only. There is no update/delete method on this
 * port, and none will be added — immutability is additionally enforced at the
 * database-privilege level (T031) so this is defense in depth, not the only
 * guard.
 */
export interface RecordAuditInput {
  readonly workspaceId: string;
  /** Omit or `null` for a system action with no human actor. */
  readonly actorUserId?: string | null;
  /** Stable event name, e.g. `membership.role_changed`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  /** PII-minimized before/after or reason (ADR-019). */
  readonly metadata?: Record<string, unknown>;
  readonly requestId: string;
}

export interface AuditRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: Record<string, unknown>;
  readonly requestId: string;
  readonly occurredAt: Date;
}

export type RecordAudit = (input: RecordAuditInput) => Promise<AuditRecord>;
