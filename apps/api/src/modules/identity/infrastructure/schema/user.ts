/**
 * `identity.users` — not tenant-owned (data-model.md "User"). Credentials are
 * never stored here; verification is the credential adapter's job (FR-027,
 * ADR-007), which is a later PR (T035).
 *
 * This is a typed schema declaration only. The authoritative DDL is the
 * reviewed SQL migration (T031, `packages/db/migrations/0002_identity.sql`);
 * no `drizzle-kit push`/generate is used against it (ADR-004). No repository
 * reads/writes this table yet (T034, out of scope for this PR).
 */
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { UserId } from "../../domain/ids.js";
import { citext } from "./_custom-types.js";

export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom().$type<UserId>(),
  /** Opaque handle from the credential adapter; unique when present. */
  externalRef: text("external_ref"),
  email: citext("email").notNull(),
  displayName: text("display_name").notNull(),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
