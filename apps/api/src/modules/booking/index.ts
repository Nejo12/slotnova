/**
 * `booking` module public entry point — the pure domain surface only,
 * mirroring `catalog/index.ts` and `scheduling/index.ts`.
 *
 * PR-05 exported nothing from `booking/application/**` because no sibling
 * module needed a Booking concept yet. PR-09 (issue #81) is that real
 * consumer: Calendar's read composition. Exactly ONE application symbol is
 * published for it — {@link BookingOccupancyPort}, the narrow occupancy read
 * seam — and no repository, no other use case and no schema is reachable
 * from here. Widen this file only when another real consumer appears; never
 * import `booking/infrastructure/**` from another module (enforced by
 * `no-cross-module-internals`).
 *
 * There is deliberately no `BookingModule` in PR-05: the module has no
 * controller and no provider any other module resolves, so a NestJS module
 * registered nowhere would be dead wiring. PR-07 adds it together with the
 * HTTP layer, exactly as PR-03 shipped Scheduling's domain with no module and
 * PR-04 added `SchedulingModule` with its controllers.
 */

export {
  BOOKING_CANCEL,
  BOOKING_CAPABILITIES,
  BOOKING_COMPLETE,
  BOOKING_CREATE,
  BOOKING_EDIT,
  BOOKING_READ,
  type BookingCapability,
} from "./domain/policy/capabilities.js";

export {
  BookingOccupancyPort,
  OCCUPYING_BOOKING_STATUSES,
  type BookingOccupancyRange,
  type OccupiedBooking,
  type OccupyingBookingStatus,
} from "./application/booking-occupancy.port.js";

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
  BookingOverlapError,
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
