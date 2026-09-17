/**
 * Booking domain errors.
 *
 * These are pure domain failures: they carry no HTTP status, no `problem+json`
 * slug and no transport vocabulary of any kind. Translating them at the API
 * boundary belongs to the Booking HTTP layer (PR-07), exactly as Catalog's and
 * Scheduling's domain errors are translated by their own problem filters. The
 * mapping PR-07 will apply is already fixed by
 * `contracts/booking.contract.md` — `InvalidBookingTransitionError` ->
 * `409 invalid-transition`, `StaleBookingVersionError` -> `409 stale-write`,
 * the validation errors -> `422 validation` — but none of that vocabulary
 * appears here.
 */
import type { BookingId } from "./ids.js";
import type { BookingCommand, BookingStatus } from "./booking-status.js";

export class InvalidBookingDurationError extends Error {
  override readonly name = "InvalidBookingDurationError";

  constructor(readonly serviceDurationMinutes: number) {
    super(
      `booking service_duration_minutes must be an integer >= 1, got ${serviceDurationMinutes}`,
    );
  }
}

export class InvalidBookingBufferError extends Error {
  override readonly name = "InvalidBookingBufferError";

  constructor(
    readonly field: "preBufferMinutes" | "postBufferMinutes",
    readonly value: number,
  ) {
    super(`booking ${field} must be an integer >= 0, got ${value}`);
  }
}

/**
 * The command is not legal from the booking's current state
 * (data-model.md "State transitions"). Raised for every terminal-state
 * rejection and for reschedule from anything other than `confirmed`.
 */
export class InvalidBookingTransitionError extends Error {
  override readonly name = "InvalidBookingTransitionError";

  constructor(
    readonly command: BookingCommand,
    readonly from: BookingStatus,
  ) {
    super(`booking command "${command}" is not valid from state "${from}"`);
  }
}

/**
 * The caller's `expectedVersion` did not match the booking's current version
 * (research.md R-OCC, FR-026). Distinct from
 * `InvalidBookingTransitionError` because the two carry different client
 * remedies — refetch-and-retry versus show-conflict (data-model.md: the two
 * `409`s use "distinct `type` URIs in the problem body ... so clients can
 * branch UX correctly").
 */
export class StaleBookingVersionError extends Error {
  override readonly name = "StaleBookingVersionError";

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`booking version ${expectedVersion} is stale; the current version is ${actualVersion}`);
  }
}

/**
 * The booking's blocking interval overlaps another `confirmed` booking in the
 * same workspace (issue #70, ADR-011, FR-022, SC-001/SC-003).
 *
 * Raised ONLY when PostgreSQL rejects the write with the
 * `bookings_no_overlap` exclusion constraint — the database is the
 * authoritative overlap boundary, and there is deliberately no application
 * check that could raise this speculatively. It is a pure domain error like
 * its neighbours: PR-07 will map it to
 * `409 .../problems/booking-overlap` at the HTTP boundary
 * (`contracts/booking.contract.md`); no transport vocabulary appears here.
 */
export class BookingOverlapError extends Error {
  override readonly name = "BookingOverlapError";

  constructor() {
    super("the booking's blocking interval overlaps an existing confirmed booking");
  }
}

/**
 * No booking with that id is visible in the active workspace. RLS makes "does
 * not exist" and "belongs to another workspace" indistinguishable by
 * construction, so this single error covers both — there is deliberately no
 * separate cross-workspace error a caller could use to probe for another
 * tenant's data (the same reasoning as `ServiceNotFoundError` in Catalog).
 */
export class BookingNotFoundError extends Error {
  override readonly name = "BookingNotFoundError";

  constructor(readonly bookingId: BookingId) {
    super(`booking ${bookingId} was not found in the active workspace`);
  }
}
