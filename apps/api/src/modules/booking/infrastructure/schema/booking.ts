/**
 * `booking.bookings` — tenant-owned (data-model.md "Booking").
 *
 * Typed schema declaration only; `packages/db/migrations/0009_booking.sql` is
 * the authoritative DDL, exactly as in `catalog`/`scheduling` (ADR-020: plain
 * reviewed SQL migrations, never `drizzle-kit push`). The repository issues
 * explicit SQL rather than querying through this declaration, because every
 * temporal column is projected to ISO text in SQL and converted straight to a
 * `Temporal` value — node-postgres would otherwise hand back a JavaScript
 * `Date` (ADR-010).
 *
 * `blocking_range` is deliberately absent: it is a STORED GENERATED
 * `tstzrange` the application never writes, and drizzle-orm's pg-core has no
 * range column type to describe it faithfully. Declaring it as some other
 * type would be a false statement about the schema. The repository reads its
 * bounds explicitly via `lower()`/`upper()`.
 *
 * There is no `resource_id`, `location_id`, `staff_id` or `client_id` column
 * here for the same reason there is none in the migration (Founder decisions
 * 3–5).
 */
import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { WorkspaceId } from "../../../identity/index.js";
import { BOOKING_STATUSES } from "../../domain/booking-status.js";
import type { BookingId, ServiceReferenceId } from "../../domain/ids.js";

/** Exactly three labels — no `draft`, no `pending` (FR-020). */
export const bookingStatus = pgEnum("booking_status", BOOKING_STATUSES);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom().$type<BookingId>(),
  /** RLS read predicate; `identity.workspaces.id` at the database level. */
  workspaceId: uuid("workspace_id").notNull().$type<WorkspaceId>(),
  /** Opaque Catalog reference — no foreign key, never joined (constitution III). */
  serviceId: uuid("service_id").notNull().$type<ServiceReferenceId>(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  /** Snapshotted from the Service at creation; never re-read on reschedule. */
  serviceDurationMinutes: integer("service_duration_minutes").notNull(),
  preBufferMinutes: integer("pre_buffer_minutes").notNull(),
  postBufferMinutes: integer("post_buffer_minutes").notNull(),
  status: bookingStatus("status").notNull(),
  /** Optimistic concurrency (research.md R-OCC); starts at 1. */
  version: integer("version").notNull().default(1),
  cancelledReason: text("cancelled_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;
