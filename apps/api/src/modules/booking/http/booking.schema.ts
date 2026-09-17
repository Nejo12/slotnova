/**
 * Runtime request/response schemas for `/v1/bookings`
 * (`specs/002-catalog-scheduling-booking/contracts/booking.contract.md`,
 * PR-07, issue #73).
 *
 * These Zod schemas are the single boundary source: `createZodDto()` makes
 * each one both the runtime validator (via `apps/api/src/http/validation/
 * zod-validation.ts`'s `ZodValidationPipe`) and the OpenAPI schema
 * `@ApiBody`/`@ZodResponse` publish — which is what `packages/contracts` then
 * generates from. No hand-written DTO/interface duplicates any shape here.
 *
 * ## Strict request objects
 *
 * Every *request* schema is `.strict()`: an unexpected property is rejected
 * rather than silently dropped. Two reasons, both load-bearing:
 *
 * 1. `clientId`, `resourceId`, `locationId` and `staffId` do not exist in
 *    Phase 2 (`research.md` R-SCOPE/R-LOCATION/R-CLIENTS, Founder decisions
 *    3 & 4, FR-029). A client that sends one must be told, not quietly
 *    ignored — silently accepting `clientId` would let a caller believe a
 *    customer was attached to the booking when nothing of the sort happened.
 * 2. `POST /v1/bookings`'s idempotency fingerprint is computed from the
 *    parsed payload; a stripped unknown field would make two materially
 *    different requests fingerprint identically and silently replay one
 *    another's result. Rejecting is the only behavior that keeps "same key +
 *    materially different request -> conflict" honest.
 *
 * The create schema likewise has no `serviceDurationMinutes`,
 * `preBufferMinutes`, `postBufferMinutes`, `status`, `version` or
 * `blockingRange`: the snapshot is read server-side from the current Service,
 * and `confirmed`/version 1 are the aggregate's decision, never a caller's.
 *
 * ## Which failures are 400 and which are 422
 *
 * Shape/type failures (missing field, wrong JSON type, unknown property, an
 * instant without an offset, a non-uuid id, an unrecognised status) are the
 * existing `validation` problem at its catalogue default of 400 — unchanged
 * from every Phase-1/PR-02/PR-04 endpoint. Domain/application-invariant
 * failures (an inverted `from`/`to` window, an unavailable or inactive
 * Service, an invalid snapshot) are raised by the merged domain or by PR-07's
 * application layer and mapped to the same `validation` problem at 422 by
 * `booking-problem.filter.ts`, which is what the contract specifies. The
 * invariants themselves are therefore asserted exactly once, and are NOT
 * re-encoded here.
 *
 * ## Time strings
 *
 * Parsing is `Temporal` (ADR-010) — never `new Date(...)`. An instant must
 * carry an explicit UTC offset, exactly as `scheduling.schema.ts` requires.
 */
import { Temporal } from "@js-temporal/polyfill";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { BOOKING_STATUSES } from "../domain/booking-status.js";

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
 * Declared from the domain's own `BOOKING_STATUSES` rather than a second
 * hand-written list of the three labels, so the boundary and the state
 * machine cannot drift and the OpenAPI document publishes a real enum.
 */
const bookingStatusSchema = z.enum(BOOKING_STATUSES);

/**
 * The half-open blocking span the database computed, `[start, end)` — the
 * same `{ start, end }` shape `scheduling.schema.ts` already publishes for a
 * resolved interval, rather than a second representation of the same idea.
 *
 * It is the generated `blocking_range` column's bounds rendered as instants,
 * never PostgreSQL range literal text: no `[...)` syntax, no constraint name
 * and no SQL vocabulary reaches a client.
 */
export const bookingBlockingRangeSchema = z.object({
  /** Inclusive lower bound: `startsAt - preBufferMinutes`. */
  start: z.string(),
  /** EXCLUSIVE upper bound: `startsAt + serviceDurationMinutes + postBufferMinutes`. */
  end: z.string(),
});

/**
 * The public Booking representation — EXACTLY the accepted fields.
 *
 * `workspaceId` is deliberately absent: the caller's workspace is implicit in
 * their session and echoing it back would be tenant detail in a response body
 * for no gain. There is no `clientId`, `resourceId`, `locationId` or
 * `staffId` (no such concept exists), and no `createdAt`/`updatedAt` (no
 * accepted artifact asks for them).
 *
 * One schema serves both list and detail. `contracts/booking.contract.md`
 * calls the list payload a "summary shape" but never defines a narrower
 * projection anywhere in the accepted package, and inventing one — deciding
 * unilaterally which of ten fields a summary omits — would be contract this
 * PR was not given. `version` in particular must be present in both, because
 * the list is where a client picks the booking it is about to cancel.
 */
export const bookingResponseSchema = z.object({
  id: z.string(),
  /** Opaque Catalog reference. Booking never dereferences it. */
  serviceId: z.string(),
  startsAt: z.string(),
  /** Snapshotted from the Service at creation; never re-read, not even on reschedule. */
  serviceDurationMinutes: z.number(),
  preBufferMinutes: z.number(),
  postBufferMinutes: z.number(),
  blockingRange: bookingBlockingRangeSchema,
  status: bookingStatusSchema,
  /** The optimistic-concurrency token every mutating command must echo back. */
  version: z.number(),
  /** Set only on a real cancellation; `null` otherwise. */
  cancelledReason: z.string().nullable(),
});
export class BookingResponseDto extends createZodDto(bookingResponseSchema) {}
export type BookingResponseBody = z.infer<typeof bookingResponseSchema>;

/**
 * A list, not a page. `contracts/booking.contract.md` defines no cursor,
 * limit or total for this endpoint, and the required `from`/`to` window is
 * itself the bound — adding pagination would be API surface this PR was not
 * asked to invent. Wrapped in `{ items }` rather than returned as a bare
 * array, matching every other list endpoint this API serves.
 */
export const bookingListResponseSchema = z.object({
  items: z.array(bookingResponseSchema),
});
export class BookingListResponseDto extends createZodDto(bookingListResponseSchema) {}
export type BookingListResponseBody = z.infer<typeof bookingListResponseSchema>;

/**
 * `?from=&to=&status=` and nothing else (`contracts/booking.contract.md`).
 *
 * `from`/`to` are both REQUIRED: the repository never lists unbounded, and an
 * optional bound would be exactly that. The window is half-open `[from, to)`
 * over `startsAt` — see `BookingsRepository.list` for why that column. That
 * `to` must be strictly after `from` is the merged PR-03 interval invariant
 * (`createInterval`, a 422), deliberately NOT re-encoded here as a `.refine`
 * that would report the same rule at a different status.
 *
 * There is no `resourceId`, `staffId`, `locationId`, `clientId`, `serviceId`,
 * `cursor` or `limit` parameter, and `.strict()` rejects every one of them
 * rather than ignoring it.
 */
export const listBookingsQuerySchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
    status: bookingStatusSchema.optional(),
  })
  .strict();
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

/**
 * `{ serviceId, startsAt }` — the entire accepted create input
 * (`contracts/booking.contract.md`). See this file's header for everything
 * that is deliberately not here and why `.strict()` matters.
 */
export const createBookingRequestSchema = z
  .object({
    serviceId: z.uuid(),
    startsAt: instantSchema,
  })
  .strict();
export class CreateBookingRequestDto extends createZodDto(createBookingRequestSchema) {}
export type CreateBookingRequestBody = z.infer<typeof createBookingRequestSchema>;

/**
 * `{ version, startsAt }` (`contracts/booking.contract.md`). No `serviceId`
 * and no duration/buffer field: reschedule moves the booking in time and
 * changes nothing else — re-snapshotting the Service here would silently
 * rewrite history, which is the exact failure the snapshot exists to prevent.
 */
export const rescheduleBookingRequestSchema = z
  .object({
    version: z.number().int().min(1),
    startsAt: instantSchema,
  })
  .strict();
export class RescheduleBookingRequestDto extends createZodDto(rescheduleBookingRequestSchema) {}
export type RescheduleBookingRequestBody = z.infer<typeof rescheduleBookingRequestSchema>;

/**
 * `{ version, reason? }` (`contracts/booking.contract.md`). `reason` is
 * optional because the contract writes it optional; when omitted the stored
 * `cancelledReason` is `null`.
 */
export const cancelBookingRequestSchema = z
  .object({
    version: z.number().int().min(1),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();
export class CancelBookingRequestDto extends createZodDto(cancelBookingRequestSchema) {}
export type CancelBookingRequestBody = z.infer<typeof cancelBookingRequestSchema>;

/** `{ version }` and nothing else (`contracts/booking.contract.md`). */
export const completeBookingRequestSchema = z
  .object({
    version: z.number().int().min(1),
  })
  .strict();
export class CompleteBookingRequestDto extends createZodDto(completeBookingRequestSchema) {}
export type CompleteBookingRequestBody = z.infer<typeof completeBookingRequestSchema>;

export const bookingIdParamSchema = z.uuid();
