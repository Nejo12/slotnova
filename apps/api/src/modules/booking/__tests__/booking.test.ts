/**
 * Issue #68 (Phase 2 PR-05) — Booking aggregate/state-machine unit tests.
 *
 * tasks.md PR-05 requires "table-driven valid/invalid transition unit tests
 * covering every row in the transition table, including idempotent no-ops and
 * terminal-state rejection; an explicit test asserting `CreateBooking` never
 * produces anything other than `confirmed`". Every row of data-model.md's
 * Booking transition table has a case below, and the 3 states x 3 mutating
 * commands matrix is asserted exhaustively rather than sampled.
 *
 * Pure unit tests: the domain has no database, so none is needed here. The
 * persistence-side proofs (generated range, RLS, version guard) live in
 * `schema.int.test.ts` / `use-cases.int.test.ts` against real PostgreSQL.
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  BOOKING_COMMANDS,
  BOOKING_STATUSES,
  isTerminalBookingStatus,
  type BookingStatus,
} from "../domain/booking-status.js";
import {
  InvalidBookingBufferError,
  InvalidBookingDurationError,
  InvalidBookingTransitionError,
  StaleBookingVersionError,
} from "../domain/booking-errors.js";
import {
  INITIAL_BOOKING_VERSION,
  bookingBlockingInterval,
  cancelBooking,
  completeBooking,
  createBooking,
  isBookingUnchanged,
  rescheduleBooking,
  type Booking,
  type CreateBookingInput,
} from "../domain/booking.js";
import { asBookingId, asServiceReferenceId } from "../domain/ids.js";

const BOOKING_ID = asBookingId("11111111-1111-4111-8111-111111111111");
const SERVICE_ID = asServiceReferenceId("22222222-2222-4222-8222-222222222222");

const instant = (value: string): Temporal.Instant => Temporal.Instant.from(value);

function confirmed(overrides: Partial<Booking> = {}): Booking {
  return {
    ...createBooking({
      id: BOOKING_ID,
      serviceId: SERVICE_ID,
      startsAt: instant("2026-09-07T09:00:00Z"),
      serviceDurationMinutes: 60,
      preBufferMinutes: 15,
      postBufferMinutes: 10,
    }),
    ...overrides,
  };
}

/** A booking already in `status`, at the version a real transition would leave. */
function inState(status: BookingStatus): Booking {
  const base = confirmed();
  if (status === "confirmed") return base;
  if (status === "cancelled") return cancelBooking(base, { expectedVersion: 1, reason: "flu" });
  return completeBooking(base, { expectedVersion: 1 });
}

describe("Booking lifecycle vocabulary", () => {
  it("persists exactly three states — no draft, no pending", () => {
    expect([...BOOKING_STATUSES]).toEqual(["confirmed", "completed", "cancelled"]);
    expect(BOOKING_STATUSES).not.toContain("draft");
    expect(BOOKING_STATUSES).not.toContain("pending");
  });

  it("exposes no confirm command (creation lands directly at confirmed)", () => {
    expect([...BOOKING_COMMANDS]).toEqual(["create", "reschedule", "cancel", "complete"]);
    expect(BOOKING_COMMANDS).not.toContain("confirm");
  });

  it("treats cancelled and completed as terminal, and confirmed as not", () => {
    expect(isTerminalBookingStatus("cancelled")).toBe(true);
    expect(isTerminalBookingStatus("completed")).toBe(true);
    expect(isTerminalBookingStatus("confirmed")).toBe(false);
  });
});

describe("createBooking", () => {
  it("produces confirmed at version 1 with no cancellation reason", () => {
    const booking = confirmed();
    expect(booking.status).toBe("confirmed");
    expect(booking.version).toBe(INITIAL_BOOKING_VERSION);
    expect(booking.version).toBe(1);
    expect(booking.cancelledReason).toBeNull();
  });

  it("never produces anything other than confirmed, whatever the caller passes", () => {
    // There is no status parameter to pass at all — the type below is the
    // proof, and a hostile extra property is ignored rather than honoured.
    const hostile = createBooking({
      id: BOOKING_ID,
      serviceId: SERVICE_ID,
      startsAt: instant("2026-09-07T09:00:00Z"),
      serviceDurationMinutes: 30,
      preBufferMinutes: 0,
      postBufferMinutes: 0,
      status: "cancelled",
      version: 99,
    } as unknown as CreateBookingInput);
    expect(hostile.status).toBe("confirmed");
    expect(hostile.version).toBe(1);
  });

  it("keeps Temporal instants and constructs no JavaScript Date", () => {
    const booking = confirmed();
    expect(booking.startsAt).toBeInstanceOf(Temporal.Instant);
    expect(booking.startsAt).not.toBeInstanceOf(Date);
  });

  const invalid: [string, number, number, number, unknown][] = [
    ["zero duration", 0, 0, 0, InvalidBookingDurationError],
    ["negative duration", -30, 0, 0, InvalidBookingDurationError],
    ["fractional duration", 30.5, 0, 0, InvalidBookingDurationError],
    ["negative pre-buffer", 30, -1, 0, InvalidBookingBufferError],
    ["fractional pre-buffer", 30, 1.5, 0, InvalidBookingBufferError],
    ["negative post-buffer", 30, 0, -1, InvalidBookingBufferError],
    ["fractional post-buffer", 30, 0, 0.25, InvalidBookingBufferError],
  ];

  it.each(invalid)("rejects %s", (_label, duration, pre, post, error) => {
    expect(() =>
      createBooking({
        id: BOOKING_ID,
        serviceId: SERVICE_ID,
        startsAt: instant("2026-09-07T09:00:00Z"),
        serviceDurationMinutes: duration,
        preBufferMinutes: pre,
        postBufferMinutes: post,
      }),
    ).toThrow(error as never);
  });

  it("accepts zero buffers", () => {
    const booking = createBooking({
      id: BOOKING_ID,
      serviceId: SERVICE_ID,
      startsAt: instant("2026-09-07T09:00:00Z"),
      serviceDurationMinutes: 1,
      preBufferMinutes: 0,
      postBufferMinutes: 0,
    });
    expect(booking.serviceDurationMinutes).toBe(1);
  });
});

describe("bookingBlockingInterval", () => {
  const cases: [string, number, number, number, string, string, string][] = [
    [
      "zero buffers",
      60,
      0,
      0,
      "2026-09-07T09:00:00Z",
      "2026-09-07T09:00:00Z",
      "2026-09-07T10:00:00Z",
    ],
    [
      "pre-buffer only",
      60,
      15,
      0,
      "2026-09-07T09:00:00Z",
      "2026-09-07T08:45:00Z",
      "2026-09-07T10:00:00Z",
    ],
    [
      "post-buffer only",
      60,
      0,
      10,
      "2026-09-07T09:00:00Z",
      "2026-09-07T09:00:00Z",
      "2026-09-07T10:10:00Z",
    ],
    [
      "both buffers",
      60,
      15,
      10,
      "2026-09-07T09:00:00Z",
      "2026-09-07T08:45:00Z",
      "2026-09-07T10:10:00Z",
    ],
    [
      "crossing midnight",
      90,
      30,
      30,
      "2026-09-07T23:30:00Z",
      "2026-09-07T23:00:00Z",
      "2026-09-08T01:30:00Z",
    ],
  ];

  it.each(cases)("computes %s", (_label, duration, pre, post, startsAt, lower, upper) => {
    const interval = bookingBlockingInterval(
      confirmed({
        startsAt: instant(startsAt),
        serviceDurationMinutes: duration,
        preBufferMinutes: pre,
        postBufferMinutes: post,
      }),
    );
    expect(interval.start.toString()).toBe(lower);
    expect(interval.end.toString()).toBe(upper);
  });

  it("is half-open: a booking starting exactly where another ends does not overlap it", () => {
    const first = bookingBlockingInterval(
      confirmed({
        startsAt: instant("2026-09-07T09:00:00Z"),
        preBufferMinutes: 0,
        postBufferMinutes: 0,
      }),
    );
    const second = bookingBlockingInterval(
      confirmed({
        startsAt: instant("2026-09-07T10:00:00Z"),
        preBufferMinutes: 0,
        postBufferMinutes: 0,
      }),
    );
    expect(first.end.equals(second.start)).toBe(true);
  });
});

/**
 * The complete 3-state x 3-command matrix. `no-op` means the same aggregate
 * instance comes back unchanged (the two authorised same-command idempotent
 * retries); `error` means an `InvalidBookingTransitionError`.
 */
describe("state machine matrix (every state x every mutating command)", () => {
  type Outcome = BookingStatus | "no-op" | "error";

  const matrix: [BookingStatus, "reschedule" | "cancel" | "complete", Outcome][] = [
    ["confirmed", "reschedule", "confirmed"],
    ["confirmed", "cancel", "cancelled"],
    ["confirmed", "complete", "completed"],
    ["cancelled", "reschedule", "error"],
    ["cancelled", "cancel", "no-op"],
    ["cancelled", "complete", "error"],
    ["completed", "reschedule", "error"],
    ["completed", "cancel", "error"],
    ["completed", "complete", "no-op"],
  ];

  function apply(booking: Booking, command: "reschedule" | "cancel" | "complete"): Booking {
    const expectedVersion = booking.version;
    if (command === "reschedule") {
      return rescheduleBooking(booking, {
        expectedVersion,
        startsAt: instant("2026-09-08T09:00:00Z"),
      });
    }
    if (command === "cancel") return cancelBooking(booking, { expectedVersion, reason: "retry" });
    return completeBooking(booking, { expectedVersion });
  }

  it.each(matrix)("%s + %s -> %s", (from, command, outcome) => {
    const booking = inState(from);

    if (outcome === "error") {
      expect(() => apply(booking, command)).toThrow(InvalidBookingTransitionError);
      return;
    }

    const next = apply(booking, command);

    if (outcome === "no-op") {
      expect(isBookingUnchanged(booking, next)).toBe(true);
      expect(next.version).toBe(booking.version);
      expect(next.status).toBe(from);
      return;
    }

    expect(next.status).toBe(outcome);
    expect(next.version).toBe(booking.version + 1);
  });

  it("names the command and source state on every rejection", () => {
    expect(() =>
      rescheduleBooking(inState("cancelled"), {
        expectedVersion: 2,
        startsAt: instant("2026-09-08T09:00:00Z"),
      }),
    ).toThrow(/"reschedule" is not valid from state "cancelled"/u);
    expect(() => cancelBooking(inState("completed"), { expectedVersion: 2, reason: null })).toThrow(
      /"cancel" is not valid from state "completed"/u,
    );
    expect(() => completeBooking(inState("cancelled"), { expectedVersion: 2 })).toThrow(
      /"complete" is not valid from state "cancelled"/u,
    );
  });
});

describe("reschedule", () => {
  it("changes startsAt and version only — never the service or its snapshot", () => {
    const before = confirmed();
    const after = rescheduleBooking(before, {
      expectedVersion: 1,
      startsAt: instant("2026-09-08T14:00:00Z"),
    });

    expect(after.startsAt.toString()).toBe("2026-09-08T14:00:00Z");
    expect(after.version).toBe(2);
    expect(after.status).toBe("confirmed");
    expect(after.serviceId).toBe(before.serviceId);
    expect(after.serviceDurationMinutes).toBe(before.serviceDurationMinutes);
    expect(after.preBufferMinutes).toBe(before.preBufferMinutes);
    expect(after.postBufferMinutes).toBe(before.postBufferMinutes);
    expect(after.cancelledReason).toBeNull();
  });

  it("moves the blocking interval by exactly the start delta", () => {
    const before = confirmed();
    const after = rescheduleBooking(before, {
      expectedVersion: 1,
      startsAt: instant("2026-09-07T11:00:00Z"),
    });
    const beforeRange = bookingBlockingInterval(before);
    const afterRange = bookingBlockingInterval(after);

    expect(afterRange.start.toString()).toBe("2026-09-07T10:45:00Z");
    expect(afterRange.end.toString()).toBe("2026-09-07T12:10:00Z");
    expect(afterRange.start.epochMilliseconds - beforeRange.start.epochMilliseconds).toBe(
      2 * 60 * 60 * 1000,
    );
  });

  it("is not idempotent: rescheduling to the same instant is still a real transition", () => {
    const before = confirmed();
    const after = rescheduleBooking(before, { expectedVersion: 1, startsAt: before.startsAt });
    expect(isBookingUnchanged(before, after)).toBe(false);
    expect(after.version).toBe(2);
  });

  it("leaves the source aggregate untouched (no in-place mutation)", () => {
    const before = confirmed();
    rescheduleBooking(before, { expectedVersion: 1, startsAt: instant("2026-09-08T14:00:00Z") });
    expect(before.startsAt.toString()).toBe("2026-09-07T09:00:00Z");
    expect(before.version).toBe(1);
  });
});

describe("cancel", () => {
  it("records the supplied reason and bumps the version", () => {
    const after = cancelBooking(confirmed(), { expectedVersion: 1, reason: "client no-show" });
    expect(after.status).toBe("cancelled");
    expect(after.cancelledReason).toBe("client no-show");
    expect(after.version).toBe(2);
  });

  it("accepts a null reason (the contract's reason is optional)", () => {
    const after = cancelBooking(confirmed(), { expectedVersion: 1, reason: null });
    expect(after.cancelledReason).toBeNull();
  });

  it("preserves the blocking span — capacity is released by the state, not by mutation", () => {
    const before = confirmed();
    const after = cancelBooking(before, { expectedVersion: 1, reason: null });
    expect(bookingBlockingInterval(after)).toEqual(bookingBlockingInterval(before));
  });

  it("re-cancelling with the CURRENT version is a no-op that does not rewrite the reason", () => {
    const cancelled = cancelBooking(confirmed(), { expectedVersion: 1, reason: "flu" });
    const again = cancelBooking(cancelled, { expectedVersion: 2, reason: "different reason" });
    expect(isBookingUnchanged(cancelled, again)).toBe(true);
    expect(again.cancelledReason).toBe("flu");
    expect(again.version).toBe(2);
  });

  it("re-cancelling with the PRE-transition version is a stale write, not a no-op", () => {
    const cancelled = cancelBooking(confirmed(), { expectedVersion: 1, reason: "flu" });
    expect(() => cancelBooking(cancelled, { expectedVersion: 1, reason: "flu" })).toThrow(
      StaleBookingVersionError,
    );
  });
});

describe("complete", () => {
  it("moves to completed and bumps the version, keeping the booking historical", () => {
    const before = confirmed();
    const after = completeBooking(before, { expectedVersion: 1 });
    expect(after.status).toBe("completed");
    expect(after.version).toBe(2);
    expect(after.cancelledReason).toBeNull();
    expect(bookingBlockingInterval(after)).toEqual(bookingBlockingInterval(before));
  });

  it("re-completing with the CURRENT version is a no-op", () => {
    const completed = completeBooking(confirmed(), { expectedVersion: 1 });
    const again = completeBooking(completed, { expectedVersion: 2 });
    expect(isBookingUnchanged(completed, again)).toBe(true);
    expect(again.version).toBe(2);
  });

  it("re-completing with the PRE-transition version is a stale write, not a no-op", () => {
    const completed = completeBooking(confirmed(), { expectedVersion: 1 });
    expect(() => completeBooking(completed, { expectedVersion: 1 })).toThrow(
      StaleBookingVersionError,
    );
  });
});

describe("optimistic version guard", () => {
  const commands: ["reschedule" | "cancel" | "complete", (b: Booking, v: number) => Booking][] = [
    [
      "reschedule",
      (b, v) =>
        rescheduleBooking(b, { expectedVersion: v, startsAt: instant("2026-09-08T09:00:00Z") }),
    ],
    ["cancel", (b, v) => cancelBooking(b, { expectedVersion: v, reason: null })],
    ["complete", (b, v) => completeBooking(b, { expectedVersion: v })],
  ];

  it.each(commands)("%s rejects a stale expectedVersion before touching state", (_name, apply) => {
    const booking = confirmed();
    expect(() => apply(booking, 0)).toThrow(StaleBookingVersionError);
    expect(() => apply(booking, 2)).toThrow(StaleBookingVersionError);
    expect(booking.status).toBe("confirmed");
    expect(booking.version).toBe(1);
  });

  it("reports both the stale and the current version", () => {
    try {
      cancelBooking(confirmed(), { expectedVersion: 7, reason: null });
      expect.unreachable("expected a stale-version rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(StaleBookingVersionError);
      expect((error as StaleBookingVersionError).expectedVersion).toBe(7);
      expect((error as StaleBookingVersionError).actualVersion).toBe(1);
    }
  });

  it("checks the version before the state, so a terminal booking still reports a stale write", () => {
    const completed = completeBooking(confirmed(), { expectedVersion: 1 });
    expect(() => cancelBooking(completed, { expectedVersion: 1, reason: null })).toThrow(
      StaleBookingVersionError,
    );
    expect(() => cancelBooking(completed, { expectedVersion: 2, reason: null })).toThrow(
      InvalidBookingTransitionError,
    );
  });
});
