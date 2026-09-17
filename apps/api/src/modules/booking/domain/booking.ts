/**
 * The Booking aggregate and its state machine (FR-020 – FR-026,
 * data-model.md "Booking" + "State transitions", issue #68).
 *
 * Pure domain: no persistence, no NestJS coupling, no HTTP/`problem+json`
 * vocabulary, no JavaScript `Date` (ADR-010 — instants are
 * `Temporal.Instant`). Every function here is total and returns a NEW frozen
 * aggregate; nothing mutates in place.
 *
 * ## The transition table, as implemented
 *
 * | From        | Command      | To          | Version |
 * |-------------|--------------|-------------|---------|
 * | (none)      | `create`     | `confirmed` | 1       |
 * | `confirmed` | `reschedule` | `confirmed` | +1      |
 * | `confirmed` | `cancel`     | `cancelled` | +1      |
 * | `confirmed` | `complete`   | `completed` | +1      |
 * | `cancelled` | `cancel`     | `cancelled` | unchanged — idempotent no-op |
 * | `completed` | `complete`   | `completed` | unchanged — idempotent no-op |
 * | `cancelled` | `reschedule`/`complete` | — | `InvalidBookingTransitionError` |
 * | `completed` | `reschedule`/`cancel`   | — | `InvalidBookingTransitionError` |
 *
 * There is no `confirm` command and no `draft`/`pending` state
 * (`booking-status.ts`).
 *
 * ## Why the two no-ops exist (the one genuine tension in the accepted model)
 *
 * data-model.md's last transition row is a general rule — "`cancelled`/
 * `completed` | any command | ... `409 problem+json` 'booking is in a
 * terminal state'" — while the `CancelBooking` and `CompleteBooking` rows
 * each carve out a same-command exception in their Idempotency column:
 * "re-cancelling an already-`cancelled` booking with the same version is a
 * no-op success" and "re-completing with same version is a no-op success".
 * The specific rows govern their own commands; the general row governs
 * everything else. Three further pieces of the accepted package confirm that
 * reading rather than the blanket-409 one:
 *
 *  1. Each command row's own Invalid-transition column names only the OTHER
 *     terminal state — Cancel says "`409` if source is `completed`", never
 *     "if source is `cancelled`"; Complete says "`409` if source is not
 *     `confirmed`", in the same cell that grants the re-complete no-op.
 *  2. `contracts/booking.contract.md` states the cancel case outright:
 *     "Idempotent: cancelling an already-`cancelled` booking with a matching
 *     version returns `200` with the current state (no-op), not an error."
 *  3. `tasks.md` PR-05 requires "table-driven valid/invalid transition unit
 *     tests covering every row in the transition table, **including
 *     idempotent no-ops** and terminal-state rejection" — both must exist,
 *     which is only possible under this reading.
 *
 * ## What "the same version" means
 *
 * `contracts/booking.contract.md` spells it as "a MATCHING version", and
 * data-model.md's validation rules require "a `version` matching the current
 * row" of every mutating command. So `expectedVersion` is compared against
 * the booking's CURRENT version, never its pre-transition one: a naive retry
 * of the original HTTP request (carrying the pre-cancel version) is a
 * `StaleBookingVersionError`, and only a caller holding the current version
 * gets the no-op. That is also the only satisfiable reading — a real cancel
 * increments the version, so "the same version" could otherwise never match.
 *
 * Consequently the version check runs FIRST, before the state check, in every
 * mutating command: "version match required" is a precondition of each row,
 * and the no-op carve-outs are themselves conditioned on it.
 */
import { Temporal } from "@js-temporal/polyfill";

import { createInterval, type Interval } from "../../scheduling/index.js";
import {
  InvalidBookingBufferError,
  InvalidBookingDurationError,
  InvalidBookingTransitionError,
  StaleBookingVersionError,
} from "./booking-errors.js";
import type { BookingStatus } from "./booking-status.js";
import type { BookingId, ServiceReferenceId } from "./ids.js";

/**
 * The Service values snapshotted at creation time (data-model.md "Booking":
 * "snapshotted from Service at creation time (so later Service edits don't
 * retroactively change historical blocking intervals)").
 *
 * Immutable for the whole life of the booking: reschedule moves `startsAt`
 * and NOTHING else, so a Service whose duration or buffers change later never
 * alters an existing booking's blocking span.
 */
export interface BookingServiceSnapshot {
  readonly serviceDurationMinutes: number;
  readonly preBufferMinutes: number;
  readonly postBufferMinutes: number;
}

export interface Booking extends BookingServiceSnapshot {
  readonly id: BookingId;
  /** Opaque Catalog reference. Booking never dereferences or re-reads it. */
  readonly serviceId: ServiceReferenceId;
  readonly startsAt: Temporal.Instant;
  readonly status: BookingStatus;
  readonly version: number;
  /** Set only on a real cancellation (data-model.md "Booking"). */
  readonly cancelledReason: string | null;
}

export interface CreateBookingInput extends BookingServiceSnapshot {
  readonly id: BookingId;
  readonly serviceId: ServiceReferenceId;
  readonly startsAt: Temporal.Instant;
}

export interface RescheduleBookingInput {
  readonly expectedVersion: number;
  readonly startsAt: Temporal.Instant;
}

export interface CancelBookingInput {
  readonly expectedVersion: number;
  readonly reason: string | null;
}

export interface CompleteBookingInput {
  readonly expectedVersion: number;
}

/** The version every booking starts at (data-model.md "Booking": default 1). */
export const INITIAL_BOOKING_VERSION = 1;

function assertValidSnapshot(snapshot: BookingServiceSnapshot): void {
  if (!Number.isInteger(snapshot.serviceDurationMinutes) || snapshot.serviceDurationMinutes < 1) {
    throw new InvalidBookingDurationError(snapshot.serviceDurationMinutes);
  }
  if (!Number.isInteger(snapshot.preBufferMinutes) || snapshot.preBufferMinutes < 0) {
    throw new InvalidBookingBufferError("preBufferMinutes", snapshot.preBufferMinutes);
  }
  if (!Number.isInteger(snapshot.postBufferMinutes) || snapshot.postBufferMinutes < 0) {
    throw new InvalidBookingBufferError("postBufferMinutes", snapshot.postBufferMinutes);
  }
}

function assertVersionMatches(booking: Booking, expectedVersion: number): void {
  if (expectedVersion !== booking.version) {
    throw new StaleBookingVersionError(expectedVersion, booking.version);
  }
}

/**
 * `CreateBooking` — the only creation path, landing directly at `confirmed`
 * at version 1 (FR-020, data-model.md: "Every Booking is created directly at
 * `confirmed`"). There is no `CreateDraftBooking`/`CreatePendingBooking`
 * command and no status parameter: `confirmed` is not a caller choice.
 *
 * The caller supplies already-resolved Service values. This module never
 * queries Catalog — the snapshot is handed in, which is exactly what keeps
 * Booking free of a cross-module repository dependency (constitution III).
 */
export function createBooking(input: CreateBookingInput): Booking {
  assertValidSnapshot(input);

  return Object.freeze({
    id: input.id,
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    serviceDurationMinutes: input.serviceDurationMinutes,
    preBufferMinutes: input.preBufferMinutes,
    postBufferMinutes: input.postBufferMinutes,
    status: "confirmed" as const,
    version: INITIAL_BOOKING_VERSION,
    cancelledReason: null,
  });
}

/**
 * The half-open blocking span `[startsAt - preBuffer, startsAt + duration +
 * postBuffer)` (FR-022, data-model.md "Booking").
 *
 * Built with the merged PR-03 `createInterval` (tasks.md PR-05 dependency:
 * "PR-03 (interval algebra reused for blocking-range computation)") rather
 * than a second half-open implementation living here. The database computes
 * the identical span independently as the generated `blocking_range` column,
 * and `schema.int.test.ts` asserts the two agree — the column is what PR-06's
 * exclusion constraint will key on, so this function is a UX/query
 * convenience, never the overlap authority (FR-023).
 */
export function bookingBlockingInterval(booking: Booking): Interval {
  return createInterval(
    booking.startsAt.subtract({ minutes: booking.preBufferMinutes }),
    booking.startsAt.add({
      minutes: booking.serviceDurationMinutes + booking.postBufferMinutes,
    }),
  );
}

/**
 * `RescheduleBooking` — `confirmed` -> `confirmed` with a new `startsAt`
 * (data-model.md). Not idempotent by design: every reschedule is a distinct
 * intent, so there is no no-op branch here, and both terminal states reject.
 *
 * Changes `startsAt` and `version` only. `serviceId` and the snapshot are
 * untouched: re-reading the Service's CURRENT duration/buffers here would
 * silently rewrite history, which is the exact failure the snapshot exists to
 * prevent.
 */
export function rescheduleBooking(booking: Booking, input: RescheduleBookingInput): Booking {
  assertVersionMatches(booking, input.expectedVersion);
  if (booking.status !== "confirmed") {
    throw new InvalidBookingTransitionError("reschedule", booking.status);
  }

  return Object.freeze({
    ...booking,
    startsAt: input.startsAt,
    version: booking.version + 1,
  });
}

/**
 * `CancelBooking` — `confirmed` -> `cancelled`, or an idempotent no-op when
 * the booking is already `cancelled` and the caller holds the current version
 * (see this file's header for the sources). Rejects from `completed`:
 * data-model.md, "`409` if source is `completed` (terminal, cannot cancel)".
 *
 * Capacity is released by the state change alone — PR-06's exclusion
 * predicate is `WHERE (status = 'confirmed')`, so a cancelled row stops
 * blocking without any row deletion or range mutation. The historical
 * `blocking_range` is deliberately preserved.
 *
 * The no-op returns the booking EXACTLY as it stands, including its existing
 * `cancelledReason`: a no-op that quietly rewrote the reason would be a
 * mutation, and the approved model grants a no-op, not a second cancellation.
 */
export function cancelBooking(booking: Booking, input: CancelBookingInput): Booking {
  assertVersionMatches(booking, input.expectedVersion);

  if (booking.status === "cancelled") return booking;
  if (booking.status !== "confirmed") {
    throw new InvalidBookingTransitionError("cancel", booking.status);
  }

  return Object.freeze({
    ...booking,
    status: "cancelled" as const,
    cancelledReason: input.reason,
    version: booking.version + 1,
  });
}

/**
 * `CompleteBooking` — `confirmed` -> `completed`, or an idempotent no-op when
 * the booking is already `completed` and the caller holds the current version
 * (see this file's header). Rejects from `cancelled`: data-model.md, "only
 * reachable from `confirmed`".
 *
 * A completed booking stays a historical record: nothing is deleted and the
 * `blocking_range` is not mutated.
 */
export function completeBooking(booking: Booking, input: CompleteBookingInput): Booking {
  assertVersionMatches(booking, input.expectedVersion);

  if (booking.status === "completed") return booking;
  if (booking.status !== "confirmed") {
    throw new InvalidBookingTransitionError("complete", booking.status);
  }

  return Object.freeze({
    ...booking,
    status: "completed" as const,
    version: booking.version + 1,
  });
}

/**
 * True when a transition function returned the aggregate unchanged — i.e. the
 * call was one of the two authorised same-command idempotent no-ops. The
 * application layer uses it to skip the database write entirely, so a no-op
 * touches neither `version` nor `updated_at`.
 */
export function isBookingUnchanged(before: Booking, after: Booking): boolean {
  return before === after;
}
