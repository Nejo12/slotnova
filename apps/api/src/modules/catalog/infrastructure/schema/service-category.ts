/**
 * `catalog.service_categories` — tenant-owned (data-model.md
 * "ServiceCategory"). Narrow grouping only: name + sort order, no nesting/
 * icons/taxonomy (`research.md` R-CAT).
 *
 * Typed schema declaration only; the reviewed SQL migration
 * (`packages/db/migrations/0006_catalog.sql`) is authoritative DDL — RLS
 * enable/FORCE/policy ship there. The actual repository
 * (`../repositories/service-categories.repository.ts`) uses raw parameterized
 * SQL against the caller's transaction, matching every other module's
 * pattern (e.g. `audit/infrastructure/schema/audit-record.ts`) — this file
 * exists for schema ownership/typing, not because the repository queries
 * through it.
 */
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { WorkspaceId } from "../../../identity/index.js";
import type { ServiceCategoryId } from "../../domain/ids.js";

export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").primaryKey().defaultRandom().$type<ServiceCategoryId>(),
  /** RLS read predicate; `identity.workspaces.id` at the database level. */
  workspaceId: uuid("workspace_id").notNull().$type<WorkspaceId>(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceCategoryRow = typeof serviceCategories.$inferSelect;
export type NewServiceCategoryRow = typeof serviceCategories.$inferInsert;
