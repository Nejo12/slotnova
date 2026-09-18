/**
 * Maps the failures Booking's domain/application/platform layers raise onto
 * the API's `problem+json` catalogue (`apps/api/src/http/problem/**`,
 * `contracts/problem+json.contract.md`) — PR-07, issue #73. Same shape as
 * `catalog/http/catalog-problem.filter.ts` and
 * `scheduling/http/scheduling-problem.filter.ts`: a thin translation over the
 * canonical {@link ProblemExceptionFilter}, never a second error envelope.
 *
 * It rewrites only the exceptions it recognises and hands everything else to
 * the existing filter untouched, so an unrecognised throwable still becomes
 * the generic `internal` 500 with the real error logged server-side only. No
 * SQLSTATE, constraint name (`bookings_no_overlap`), table name, SQL
 * fragment, RLS detail or id belonging to another workspace can reach a
 * response through here — every message below is this module's own wording,
 * and `BookingOverlapError`/`StaleBookingVersionError` are already
 * PostgreSQL-free domain values by the time they arrive (PR-05/PR-06).
 *
 * ## The mapping, and where each row comes from
 *
 * | Thrown                            | Response                          |
 * |-----------------------------------|-----------------------------------|
 * | `BookingOverlapError`             | `409 booking-overlap`             |
 * | `StaleBookingVersionError`        | `409 stale-write`                 |
 * | `InvalidBookingTransitionError`   | `409 invalid-transition`          |
 * | `BookingNotFoundError`            | `404 not-found`                   |
 * | `IdempotencyConflictError`        | `409 idempotency-conflict`        |
 * | `BookingServiceUnavailableError`  | `422 validation` on `serviceId`   |
 * | duration/buffer snapshot invalid  | `422 validation`                  |
 * | inverted `from`/`to` window       | `422 validation` on `to`          |
 *
 * The first three are the exact rows of `contracts/booking.contract.md`'s
 * "Problem+json conflict types" table.
 *
 * ## `invalid-transition` is 409, including from reschedule
 *
 * `contracts/booking.contract.md` is internally inconsistent on exactly one
 * point: its `POST /bookings/:id/reschedule` section writes "`422` if source
 * status does not permit reschedule", while its own conflict-type table — the
 * normative one, since it is what fixes each `type` URI to a status — lists
 * `.../problems/invalid-transition` at 409, and every other terminal-state
 * rejection in the document is a 409. Issue #73's Founder-ratified semantics
 * resolve it the same way ("other terminal-state commands -> invalid-
 * transition", listed under 409). One error class therefore produces one
 * status everywhere, which is also the only reading a client can branch on:
 * `InvalidBookingTransitionError` is a conflict with durable state, not a
 * malformed request, and 422 would put it in the same bucket as a bad
 * duration. Flagged for the Founder rather than silently split.
 *
 * ## What the conflict responses do and do not carry
 *
 * `stale-write` reports the CURRENT version, because `research.md` R-OCC asks
 * for it ("returns a 409 ... with a stale-write type, current version") and
 * because it is the caller's own booking in the caller's own workspace — it
 * leaks nothing and saves a refetch-guess cycle. It does not inline the whole
 * current booking: the response shape is `problem+json`, `GET /v1/bookings/
 * :id` already returns the current state, and inventing a body field for it
 * would change a shared contract every endpoint uses.
 *
 * `booking-overlap` reports the REQUESTED blocking window (see
 * `application/booking-application-errors.ts`) — the window the server
 * computed from the caller's own `startsAt` plus the Service snapshot, which
 * on create the client cannot compute itself because it never saw the
 * buffers. That is the "conflicting time context needed for the client to
 * offer 'try another slot'" the contract asks for, and it is the largest
 * amount of context that is tenant-safe: the conflicting booking is
 * deliberately NOT queried, named, timed or hinted at, because a caller who
 * can create a booking is not thereby entitled to learn when somebody else's
 * confirmed booking runs, and no accepted artifact requires it. It travels in
 * `detail` (a field the shared shape already has) rather than in a new
 * top-level member invented for this one response; clients branch on `type`,
 * per `contracts/problem+json.contract.md`.
 */
import { Catch } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { ProblemExceptionFilter } from "../../../http/problem/problem.filter.js";
import { IdempotencyConflictError } from "../../platform/idempotency/idempotency-errors.js";
import { InvalidIntervalBoundsError } from "../../scheduling/index.js";
import {
  BookingServiceUnavailableError,
  RequestedBookingOverlapError,
} from "../application/booking-application-errors.js";
import {
  BookingNotFoundError,
  BookingOverlapError,
  InvalidBookingBufferError,
  InvalidBookingDurationError,
  InvalidBookingTransitionError,
  StaleBookingVersionError,
} from "../domain/booking-errors.js";

/**
 * Domain/application-invariant violations are the `validation` problem at 422
 * — the status `contracts/booking.contract.md` specifies for "invalid input
 * (duration mismatch, inactive service, malformed range)" — as opposed to the
 * catalogue's 400 default, which stays reserved for a request malformed at
 * the schema level.
 */
const UNPROCESSABLE = 422;

function validationProblem(path: string, message: string): ProblemException {
  return new ProblemException("validation", {
    status: UNPROCESSABLE,
    errors: [{ path, message }],
  });
}

export function toBookingProblem(exception: unknown): unknown {
  // The enriched subclass first: it IS a `BookingOverlapError`, so the
  // general branch below would otherwise swallow the window it carries.
  if (exception instanceof RequestedBookingOverlapError) {
    return new ProblemException("booking-overlap", {
      detail:
        `The requested booking would block ${exception.requestedStart.toString()} to ` +
        `${exception.requestedEnd.toString()} (the appointment plus the service's buffers), ` +
        "which overlaps an existing confirmed booking. Choose another time.",
    });
  }
  if (exception instanceof BookingOverlapError) {
    return new ProblemException("booking-overlap", {
      detail: "That time overlaps an existing confirmed booking. Choose another time.",
    });
  }
  if (exception instanceof StaleBookingVersionError) {
    return new ProblemException("stale-write", {
      detail: `This booking has changed since you loaded it; its current version is ${exception.actualVersion}. Reload it and try again.`,
    });
  }
  if (exception instanceof InvalidBookingTransitionError) {
    return new ProblemException("invalid-transition", {
      // The command and the source state are the caller's own booking's, so
      // naming them leaks nothing and is what makes the message actionable.
      detail: `A booking that is already ${exception.from} cannot be ${transitionVerb(exception.command)}.`,
    });
  }
  if (exception instanceof BookingNotFoundError) {
    // Identical for "no such booking" and "another workspace's booking" —
    // the caller cannot tell a foreign id from a nonexistent one.
    return new ProblemException("not-found");
  }
  if (exception instanceof IdempotencyConflictError) {
    return new ProblemException("idempotency-conflict", {
      detail:
        "This Idempotency-Key was already used for a different request. Use a new key, or retry the original request unchanged.",
    });
  }
  if (exception instanceof BookingServiceUnavailableError) {
    // Non-leaking: a service that does not exist and a service owned by
    // another workspace produce the identical "not available" message, with
    // no id echoed back.
    return validationProblem(
      "serviceId",
      exception.reason === "inactive"
        ? "The referenced service is not currently active."
        : "The referenced service is not available.",
    );
  }
  if (exception instanceof InvalidBookingDurationError) {
    return validationProblem("serviceId", exception.message);
  }
  if (exception instanceof InvalidBookingBufferError) {
    return validationProblem("serviceId", exception.message);
  }
  if (exception instanceof InvalidIntervalBoundsError) {
    // The only interval a Booking caller supplies directly is the list
    // window, so `to` is the field at fault.
    return validationProblem("to", exception.message);
  }
  return exception;
}

function transitionVerb(command: string): string {
  if (command === "cancel") return "cancelled";
  if (command === "complete") return "completed";
  if (command === "reschedule") return "rescheduled";
  return command;
}

@Catch()
export class BookingProblemFilter extends ProblemExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(toBookingProblem(exception), host);
  }
}
