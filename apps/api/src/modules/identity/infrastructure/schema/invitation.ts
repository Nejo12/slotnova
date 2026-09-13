/**
 * `identity.invitations` — tenant-owned (data-model.md "Invitation"). The raw
 * invitation token is never persisted, only `token_hash` (security-and-audit.md
 * "never trust client-supplied ... without server verification"). The partial
 * unique index (`workspace_id`, `email`) `WHERE status = 'pending'` — allowing
 * a new invitation once a prior one is no longer pending — is expressed in the
 * SQL migration (T031); Drizzle's `uniqueIndex(...).where(...)` mirrors it here
 * for type-level documentation.
 */
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import type { InvitationId, MembershipId, UserId, WorkspaceId } from "../../domain/ids.js";
import { citext } from "./_custom-types.js";
import { membershipRoleEnum, memberships } from "./membership.js";
import { users } from "./user.js";
import { workspaces } from "./workspace.js";

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom().$type<InvitationId>(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id)
      .$type<WorkspaceId>(),
    email: citext("email").notNull(),
    role: membershipRoleEnum("role").notNull(),
    /** Hash of a high-entropy token; the raw token is never stored. */
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => memberships.id)
      .$type<MembershipId>(),
    acceptedByUserId: uuid("accepted_by_user_id")
      .references(() => users.id)
      .$type<UserId>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invitations_pending_workspace_id_email_key")
      .on(table.workspaceId, table.email)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export type InvitationRow = typeof invitations.$inferSelect;
export type NewInvitationRow = typeof invitations.$inferInsert;
