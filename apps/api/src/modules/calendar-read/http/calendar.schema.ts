/**
 * Runtime request/response schemas for `GET /v1/calendar`
 * (`specs/002-catalog-scheduling-booking/contracts/calendar.contract.md`,
 * PR-09, issue #81).
 *
 * Runtime-schema first (FR-041): these Zod schemas are the single boundary
 * source — `createZodDto()` makes each one both the runtime validator and
 * the OpenAPI schema `@ZodResponse` publishes, which `packages/contracts`
 * then generates from. No hand-written DTO duplicates any shape here.
 *
 * `createZodDto` comes from the PROJECT-OWNED wrapper
 * (`apps/api/src/http/openapi/zod-dto.ts`, issue #79), never straight from
 * `nestjs-zod`.
 *
 * ## What is deliberately absent
 *
 * No `resourceId` (the resource is workspace-implicit — `research.md`
 * R-SCOPE, and the accepted contract's Founder review note says so
 * outright), no `locationId`, no `staffId`, no `clientId` and no client or
 * customer data anywhere (`research.md` R-CLIENTS). No Service name, price,
 * category or duration: the Calendar entry carries the OPAQUE `serviceId`
 * only. No `version`, no `cancelledReason`, no buffer figures — a Calendar
 * entry is not a Booking detail payload, and `/bookings/{id}` already serves
 * that. Nothing speculative is added "for the UI later".
 *
 * The request schema is `.strict()` for the same reason every other Phase-2
 * request schema is: a caller who sends `resourceId` must be told it does
 * not exist, not have it silently ignored.
 */
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

import { createZodDto } from "../../../http/openapi/zod-dto.js";
import { OCCUPYING_BOOKING_STATUSES } from "../../booking/index.js";

/** An absolute instant with an explicit UTC offset, e.g. `2026-09-01T09:00:00Z`. */
const instantSchema = z.string().refine(
  (value) => {
    try {
      Temporal.Instant.from(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be an ISO-8601 instant with an explicit UTC offset" },
);

/**
 * A half-open `[start, end)` span of UTC instants — the SAME `{ start, end }`
 * shape `scheduling.schema.ts` publishes for a resolved interval and
 * `booking.schema.ts` publishes for a blocking range, rather than a third
 * representation of one idea.
 */
export const calendarIntervalSchema = z.object({
  start: z.string(),
  /** EXCLUSIVE. */
  end: z.string(),
});

/**
 * One occupied entry: the interval it occupies plus the minimum identity the
 * Calendar UI needs to label it and navigate to `/bookings/{bookingId}`.
 *
 * `status` is `confirmed` or `completed`. A `cancelled` booking never
 * appears: it occupies no time (`bookings_no_overlap` is PARTIAL on
 * `status = 'confirmed'`), so showing it would be a false statement about
 * what is free. That decision is Booking's, made in its occupancy port.
 */
export const calendarOccupiedEntrySchema = z.object({
  bookingId: z.string(),
  /** Opaque Catalog reference. Calendar never dereferences it. */
  serviceId: z.string(),
  startsAt: z.string(),
  /** The occupied interval, buffers included — Booking's generated `blockingRange`. */
  occupied: calendarIntervalSchema,
  /**
   * Exactly the statuses that occupy time, declared from Booking's own
   * `OCCUPYING_BOOKING_STATUSES` rather than a second hand-written list — so
   * the published enum tells a client the truth (`cancelled` can never
   * appear) instead of making it defend against a value this endpoint never
   * returns.
   */
  status: z.enum(OCCUPYING_BOOKING_STATUSES),
});

/**
 * The composed read model: the window that was actually served, the open
 * intervals, and the occupied entries. `range` is echoed so a client can
 * prove which window a cached payload belongs to without re-parsing its own
 * request.
 */
export const calendarResponseSchema = z.object({
  range: calendarIntervalSchema,
  open: z.array(calendarIntervalSchema),
  occupied: z.array(calendarOccupiedEntrySchema),
});
export class CalendarResponseDto extends createZodDto(calendarResponseSchema) {}
export type CalendarResponseBody = z.infer<typeof calendarResponseSchema>;

/**
 * `?from=&to=` and nothing else. Both bounds are REQUIRED: Calendar never
 * reads unbounded, and the window is bounded by the same Scheduling
 * expansion horizon `scheduling.contract.md`'s resolve endpoint uses.
 *
 * That `to` must be strictly after `from` is the merged PR-03 interval
 * invariant (`createInterval`, a 422), deliberately NOT re-encoded here as a
 * `.refine` that would report the same rule at a different status.
 */
export const calendarQuerySchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
  })
  .strict();
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
