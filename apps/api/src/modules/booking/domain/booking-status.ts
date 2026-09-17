/**
 * The Phase-2 Booking lifecycle vocabulary (FR-020, data-model.md "Booking",
 * Founder decisions 1 & 2).
 *
 * EXACTLY three persisted states. `draft` and `pending` do not exist:
 * Draft/Review are client/UI-only concepts that are never persisted, and
 * `Pending` is a documented future lifecycle extension point, not a value
 * added to the Phase-2 enum for speculative future use. The migration's
 * `booking_status` PostgreSQL enum carries exactly these three labels, and
 * `booking/__tests__/schema.int.test.ts` asserts the database agrees.
 */
export const BOOKING_STATUSES = ["confirmed", "completed", "cancelled"] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * The commands this module accepts. There is deliberately no `confirm`:
 * `CreateBooking` lands directly at `confirmed`, so there is no `pending`
 * state to confirm from (data-model.md: "There is no `ConfirmBooking` command
 * in Phase 2"; `contracts/booking.contract.md` "Not part of Phase 2").
 *
 * This is a plain union used for error reporting, not a state-machine
 * framework: the transitions themselves are four ordinary functions in
 * `booking.ts`, each with its own signature and its own rules.
 */
export const BOOKING_COMMANDS = ["create", "reschedule", "cancel", "complete"] as const;

export type BookingCommand = (typeof BOOKING_COMMANDS)[number];

/**
 * `completed` and `cancelled` are terminal (data-model.md: "`cancelled`/
 * `completed` | any command | ... `409 problem+json` 'booking is in a
 * terminal state'"). The two same-command idempotent no-ops the approved
 * model carves out of that rule live in `cancel`/`complete` themselves.
 */
export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return status === "completed" || status === "cancelled";
}
