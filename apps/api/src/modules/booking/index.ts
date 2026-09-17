/**
 * `booking` module public entry point — the pure domain surface only,
 * mirroring `catalog/index.ts` and `scheduling/index.ts`.
 *
 * Nothing from `booking/application/**` or `booking/infrastructure/**` is
 * exported: no sibling module needs a Booking concept yet (Calendar's
 * read-composition endpoint is PR-09), and a repository or use case exported
 * "just in case" would be exactly the cross-domain shortcut constitution III
 * forbids. Widen this file when a real consumer appears; never import
 * `booking/infrastructure/**` from another module (enforced by
 * `no-cross-module-internals`).
 *
 * There is deliberately no `BookingModule` in PR-05: the module has no
 * controller and no provider any other module resolves, so a NestJS module
 * registered nowhere would be dead wiring. PR-07 adds it together with the
 * HTTP layer, exactly as PR-03 shipped Scheduling's domain with no module and
 * PR-04 added `SchedulingModule` with its controllers.
 */

export {
  BOOKING_COMMANDS,
  BOOKING_STATUSES,
  isTerminalBookingStatus,
  type BookingCommand,
  type BookingStatus,
} from "./domain/booking-status.js";

export {
  INITIAL_BOOKING_VERSION,
  bookingBlockingInterval,
  cancelBooking,
  completeBooking,
  createBooking,
  isBookingUnchanged,
  rescheduleBooking,
  type Booking,
  type BookingServiceSnapshot,
  type CancelBookingInput,
  type CompleteBookingInput,
  type CreateBookingInput,
  type RescheduleBookingInput,
} from "./domain/booking.js";

export {
  BookingNotFoundError,
  InvalidBookingBufferError,
  InvalidBookingDurationError,
  InvalidBookingTransitionError,
  StaleBookingVersionError,
} from "./domain/booking-errors.js";

export {
  asBookingId,
  asServiceReferenceId,
  type BookingId,
  type ServiceReferenceId,
} from "./domain/ids.js";
