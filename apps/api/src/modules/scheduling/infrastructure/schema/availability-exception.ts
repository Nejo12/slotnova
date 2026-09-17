/**
 * `scheduling.availability_exceptions` — tenant-owned (data-model.md
 * "AvailabilityException"). Always resolved instants, never a recurring rule
 * (FR-012): there is deliberately no rule/RRULE column here.
 *
 * Typed schema declaration only; `packages/db/migrations/0008_scheduling.sql`
 * is authoritative DDL. See the sibling `availability-pattern.ts` for why the
 * repository does not query through this declaration.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { WorkspaceId } from "../../../identity/index.js";
import type { AvailabilityExceptionId } from "../../domain/ids.js";

export const availabilityExceptions = pgTable("availability_exceptions", {
  id: uuid("id").primaryKey().defaultRandom().$type<AvailabilityExceptionId>(),
  /** RLS read predicate; `identity.workspaces.id` at the database level. */
  workspaceId: uuid("workspace_id").notNull().$type<WorkspaceId>(),
  /** Inclusive lower bound of the half-open `[starts_at, ends_at)` span. */
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  /** Exclusive upper bound of the half-open `[starts_at, ends_at)` span. */
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AvailabilityExceptionRow = typeof availabilityExceptions.$inferSelect;
export type NewAvailabilityExceptionRow = typeof availabilityExceptions.$inferInsert;
