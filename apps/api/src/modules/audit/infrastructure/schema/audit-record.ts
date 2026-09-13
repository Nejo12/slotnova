/**
 * `audit.audit_records` — tenant-owned, append-only (data-model.md
 * "AuditRecord"). Immutability is enforced at the database-privilege level
 * (T031: the app role is granted `INSERT`+`SELECT` only, never `UPDATE`/
 * `DELETE`) — not merely by omitting update/delete methods from this module's
 * port (FR-032, security-and-audit.md "Audit events").
 *
 * Typed schema declaration only; the reviewed SQL migration
 * (`packages/db/migrations/0003_audit.sql`) is authoritative DDL. The actual
 * writer (`../audit-writer.ts`) uses raw parameterized SQL against the
 * caller's transaction, matching the platform outbox writer's pattern — this
 * file exists for schema ownership/typing, not because the writer queries
 * through it.
 */
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type { AuditRecordId } from "../../domain/ids.js";

export const auditRecords = pgTable("audit_records", {
  id: uuid("id").primaryKey().defaultRandom().$type<AuditRecordId>(),
  /** RLS read predicate; `identity.workspaces.id` at the database level. */
  workspaceId: uuid("workspace_id").notNull(),
  /** Null for system actions. */
  actorUserId: uuid("actor_user_id"),
  /** Stable event name, e.g. `membership.role_changed`. */
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  /** Before/after or reason; PII-minimized (ADR-019). */
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  /** Correlation id (FR-032, FR-054). */
  requestId: text("request_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditRecordRow = typeof auditRecords.$inferSelect;
export type NewAuditRecordRow = typeof auditRecords.$inferInsert;
