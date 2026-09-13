/**
 * `identity.memberships` — tenant-owned (data-model.md "Membership"). Unique
 * `(workspace_id, user_id)`: a user has at most one membership per workspace.
 * The "at least one owner per workspace" invariant is an application-layer
 * rule (later PR, T041/T045) — not expressible as a single-table constraint.
 */
import { pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type { MembershipId, UserId, WorkspaceId } from "../../domain/ids.js";
import { users } from "./user.js";
import { workspaces } from "./workspace.js";

export const membershipRoleEnum = pgEnum("membership_role", ["owner", "admin", "manager", "staff"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended"]);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom().$type<MembershipId>(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id)
      .$type<WorkspaceId>(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id)
      .$type<UserId>(),
    role: membershipRoleEnum("role").notNull(),
    /** Explicit capability list; server-side authorization reads this (FR-031). */
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: membershipStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_workspace_id_user_id_key").on(table.workspaceId, table.userId),
    // Referenced key for invitations' composite FK (workspace_id, invited_by)
    // -> memberships(workspace_id, id): PostgreSQL requires an actual unique
    // constraint (not just a unique index) on the exact referenced columns.
    // This lets the database itself refuse an invitation whose invited_by
    // membership belongs to a different workspace than the invitation does.
    unique("memberships_workspace_id_id_key").on(table.workspaceId, table.id),
  ],
);

export type MembershipRow = typeof memberships.$inferSelect;
export type NewMembershipRow = typeof memberships.$inferInsert;
