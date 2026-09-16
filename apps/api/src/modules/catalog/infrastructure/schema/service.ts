/**
 * `catalog.services` — tenant-owned (data-model.md "Service"). Phase-2 PR-01
 * fields only: no add-ons, staff-service capability, location, or client
 * reference (Founder decisions, `spec.md` Clarifications).
 *
 * Typed schema declaration only; the reviewed SQL migration
 * (`packages/db/migrations/0006_catalog.sql`) is authoritative DDL — RLS
 * enable/FORCE/policy ship there. The actual repository
 * (`../repositories/services.repository.ts`) uses raw parameterized SQL
 * against the caller's transaction, matching every other module's pattern.
 */
import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { WorkspaceId } from "../../../identity/index.js";
import type { ServiceCategoryId, ServiceId } from "../../domain/ids.js";

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom().$type<ServiceId>(),
  /** RLS read predicate; `identity.workspaces.id` at the database level. */
  workspaceId: uuid("workspace_id").notNull().$type<WorkspaceId>(),
  /** Optional; `catalog.service_categories.id` at the database level, same workspace (enforced by a composite FK). */
  categoryId: uuid("category_id").$type<ServiceCategoryId | null>(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  preBufferMinutes: integer("pre_buffer_minutes").notNull().default(0),
  postBufferMinutes: integer("post_buffer_minutes").notNull().default(0),
  /** ADR-015 integer minor units — never floating point. */
  priceAmountMinor: bigint("price_amount_minor", { mode: "number" }).notNull(),
  /** ISO-4217 code (`../../domain/money.ts` validates against the accepted allowlist). */
  priceCurrency: text("price_currency").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceRow = typeof services.$inferSelect;
export type NewServiceRow = typeof services.$inferInsert;
