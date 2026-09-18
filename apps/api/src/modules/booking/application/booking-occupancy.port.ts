/**
 * Booking's deliberate public port for "which bookings OCCUPY this absolute
 * window?" (PR-09, issue #81, `contracts/calendar.contract.md`).
 *
 * ## Why this file exists at all
 *
 * Calendar is a read COMPOSITION, not a bounded context (ADR-012). It must
 * ask Booking which time is taken and must not learn that `public.bookings`,
 * its generated `blocking_range` column or its exclusion constraint exist.
 * Importing `booking/infrastructure/**` from another module is a hard
 * prohibition (constitution III, dependency-cruiser
 * `no-cross-module-internals`). So Booking owns and publishes this port,
 * exactly as Catalog owns and publishes `ServiceSnapshotPort` (PR-07) and
 * Scheduling owns `AvailabilityReadPort`.
 *
 * ## Why the overlap rule is not restated here
 *
 * `listOccupying` forwards verbatim to {@link ListBookingsUseCase}, i.e. to
 * `BookingsRepository.list`, whose predicate is
 * `blocking_range && tstzrange(from, to, '[)')` — the PR-07A (issue #75)
 * semantics. Calendar therefore inherits, rather than re-derives:
 *
 *   - a booking starting BEFORE `from` whose duration or post-buffer reaches
 *     into the window is occupied and IS returned;
 *   - a booking whose occupied interval ends exactly at `from` is adjacent,
 *     not overlapping, and is NOT returned;
 *   - a booking whose occupied interval begins exactly at `to` is adjacent,
 *     not overlapping, and is NOT returned.
 *
 * Half-open adjacency is decided by PostgreSQL's own `'[)'` range semantics
 * on the same generated column `bookings_no_overlap` excludes on. No overlap
 * arithmetic exists anywhere in `calendar-read/`.
 *
 * ## Why `cancelled` is dropped HERE and not in Calendar
 *
 * "Does this booking occupy time?" is a Booking question, so Booking answers
 * it. `0010_booking_overlap_exclusion.sql` makes `bookings_no_overlap`
 * PARTIAL on `status = 'confirmed'` precisely because a cancelled booking
 * releases its window — the row survives as history and occupies nothing. A
 * `completed` booking is a real appointment that DID occupy its window and
 * still does in any view of the past, so it stays. Rendering a cancelled
 * booking as occupied time would be a false statement about availability,
 * and letting Calendar make that call would be Calendar deciding Booking
 * semantics.
 *
 * ## Why the summary is this small
 *
 * EXACTLY what a Calendar occupancy entry needs: the occupied interval, the
 * identity to navigate to `/bookings/:bookingId`, the opaque Service
 * reference, the start the operator reads, and the status the UI labels in
 * words. No `version`, no snapshotted duration/buffer figures, no
 * `cancelledReason` — and there is no client, resource, staff or location
 * concept in Phase-2 Booking to leak. A port returning `BookingRecord` would
 * quietly make every future Booking column part of Calendar's vocabulary.
 */
import { Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";

import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import type { BookingStatus } from "../domain/booking-status.js";
import type { BookingId, ServiceReferenceId } from "../domain/ids.js";
import { ListBookingsUseCase } from "./read-bookings.use-case.js";

/**
 * The statuses that OCCUPY time, as Booking defines them — the vocabulary a
 * Calendar entry can carry. Derived from the domain's own `BOOKING_STATUSES`
 * rather than hand-listed, so the two cannot drift, and narrowed to exactly
 * the non-cancelled ones for the reason in this file's header.
 */
export const OCCUPYING_BOOKING_STATUSES = [
  "confirmed",
  "completed",
] as const satisfies readonly BookingStatus[];

export type OccupyingBookingStatus = (typeof OCCUPYING_BOOKING_STATUSES)[number];

/**
 * Compile-time proof that the list above is EXACTLY the domain's statuses
 * minus `cancelled`. Adding a fourth status to `BOOKING_STATUSES` without
 * deciding whether it occupies time makes this assignment fail to compile,
 * rather than silently dropping the new status from every Calendar.
 */
const _occupyingStatusesAreExhaustive: OccupyingBookingStatus = null as unknown as Exclude<
  BookingStatus,
  "cancelled"
>;
void _occupyingStatusesAreExhaustive;

/** A bounded half-open absolute window a booking's occupied interval must overlap. */
export interface BookingOccupancyRange {
  readonly from: Temporal.Instant;
  /** EXCLUSIVE. */
  readonly to: Temporal.Instant;
}

/** The minimum a Calendar entry needs. Nothing else may be added without a proven consumer. */
export interface OccupiedBooking {
  readonly bookingId: BookingId;
  readonly serviceId: ServiceReferenceId;
  readonly startsAt: Temporal.Instant;
  /** Inclusive lower bound of the occupied interval (`startsAt - preBuffer`). */
  readonly occupiedFrom: Temporal.Instant;
  /** EXCLUSIVE upper bound (`startsAt + duration + postBuffer`). */
  readonly occupiedUntil: Temporal.Instant;
  /** `confirmed` or `completed`; never `cancelled` (see this file's header). */
  readonly status: OccupyingBookingStatus;
}

@Injectable()
export class BookingOccupancyPort {
  constructor(private readonly listBookings: ListBookingsUseCase) {}

  async listOccupying(
    context: WorkspaceContext,
    range: BookingOccupancyRange,
  ): Promise<readonly OccupiedBooking[]> {
    // Listed WITHOUT a status filter (the repository takes at most one) and
    // narrowed here, so one query answers "everything in this window" and
    // this module — the occupancy authority — decides what occupies it.
    const records = await this.listBookings.execute(context, {
      from: range.from,
      to: range.to,
      status: undefined,
    });
    const occupying: OccupiedBooking[] = [];
    for (const record of records) {
      if (record.status === "cancelled") continue;
      occupying.push({
        bookingId: record.id,
        serviceId: record.serviceId,
        startsAt: record.startsAt,
        occupiedFrom: record.blockingRangeStart,
        occupiedUntil: record.blockingRangeEnd,
        status: record.status,
      });
    }
    return occupying;
  }
}
