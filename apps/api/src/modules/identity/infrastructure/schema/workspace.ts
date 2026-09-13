/**
 * `identity.workspaces` — the tenant root (data-model.md "Workspace"). Every
 * other tenant-owned table's `workspace_id` ultimately points here. Not itself
 * RLS-gated (a workspace scopes itself).
 */
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { WorkspaceId } from "../../domain/ids.js";

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "suspended"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom().$type<WorkspaceId>(),
  name: text("name").notNull(),
  /** Unique; used in URLs. */
  slug: text("slug").notNull(),
  status: workspaceStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
