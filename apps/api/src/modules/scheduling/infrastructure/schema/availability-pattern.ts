/**
 * `scheduling.availability_patterns` — tenant-owned (data-model.md
 * "AvailabilityPattern"). Workspace-scoped only: no `resource_id`,
 * `location_id` or `staff_id` column exists (Founder decisions 3 & 4).
 *
 * Typed schema declaration only; the reviewed SQL migration
 * (`packages/db/migrations/0008_scheduling.sql`) is authoritative DDL — RLS
 * enable/FORCE/policy and every CHECK ship there. The repository
 * (`../repositories/availability-patterns.repository.ts`) uses raw
 * parameterized SQL against the caller's transaction, matching every other
 * module's pattern (e.g. `catalog/infrastructure/schema/service.ts`) — this
 * file exists for schema ownership/typing, not because the repository queries
 * through it.
 */
import { date, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { WorkspaceId } from "../../../identity/index.js";
import type { WeeklyAvailabilityRule } from "../../domain/recurrence.js";
import type { AvailabilityPatternId } from "../../domain/ids.js";

export const availabilityPatterns = pgTable("availability_patterns", {
  id: uuid("id").primaryKey().defaultRandom().$type<AvailabilityPatternId>(),
  /** RLS read predicate; `identity.workspaces.id` at the database level. */
  workspaceId: uuid("workspace_id").notNull().$type<WorkspaceId>(),
  /** IANA identifier — validated by the PR-03 domain, never by SQL. */
  timezone: text("timezone").notNull(),
  weeklyRule: jsonb("weekly_rule").notNull().$type<WeeklyAvailabilityRule[]>(),
  /** Inclusive lower bound of the half-open effective window; NULL = unbounded. */
  effectiveFrom: date("effective_from"),
  /** EXCLUSIVE upper bound of the half-open effective window; NULL = unbounded. */
  effectiveUntil: date("effective_until"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AvailabilityPatternRow = typeof availabilityPatterns.$inferSelect;
export type NewAvailabilityPatternRow = typeof availabilityPatterns.$inferInsert;
