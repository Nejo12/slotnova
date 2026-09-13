/**
 * `identity.locations` — tenant-owned (data-model.md "Location"). `timezone`
 * is data only in Phase 1: validated as a real IANA id at the application
 * boundary (`../../domain/timezone.ts`) before a write, but no scheduling
 * behavior reads it yet (ADR-010). RLS enable/FORCE/policy ship in T031.
 */
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { LocationId, WorkspaceId } from "../../domain/ids.js";
import { workspaces } from "./workspace.js";

export const locationStatusEnum = pgEnum("location_status", ["active", "archived"]);

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom().$type<LocationId>(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id)
    .$type<WorkspaceId>(),
  name: text("name").notNull(),
  /** IANA zone id, e.g. "Europe/Berlin". */
  timezone: text("timezone").notNull(),
  status: locationStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LocationRow = typeof locations.$inferSelect;
export type NewLocationRow = typeof locations.$inferInsert;
