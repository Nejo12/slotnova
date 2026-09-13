/**
 * `identity.sessions` — NOT tenant-owned; keyed by user (data-model.md
 * "Session"). No RLS: sessions are looked up by their hashed identifier before
 * any workspace context exists, so a workspace predicate would be backwards.
 *
 * `id` stores the hash of the opaque session token that is actually placed in
 * the cookie (security-and-audit.md "server-side session revocation"; the raw
 * token, like an invitation token, is never persisted). Issuing/rotating/
 * revoking sessions is the session service, a later PR (T036) — this file is
 * schema only.
 */
import { jsonb, pgTable, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type { SessionId, UserId, WorkspaceId } from "../../domain/ids.js";
import { users } from "./user.js";
import { workspaces } from "./workspace.js";

export const sessions = pgTable("sessions", {
  /** Hash of the opaque session token carried by the cookie. */
  id: uuid("id").primaryKey().defaultRandom().$type<SessionId>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .$type<UserId>(),
  /** Null until the user selects/has a workspace. */
  activeWorkspaceId: uuid("active_workspace_id")
    .references(() => workspaces.id)
    .$type<WorkspaceId>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  /** Audit chain across rotations. */
  rotatedFrom: uuid("rotated_from")
    .references((): AnyPgColumn => sessions.id)
    .$type<SessionId>(),
  /** Coarse UA/IP hint for anomaly detection; not PII-heavy. */
  clientHint: jsonb("client_hint")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
