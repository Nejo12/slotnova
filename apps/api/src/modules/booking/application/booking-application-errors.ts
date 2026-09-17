/**
 * The failures the Booking APPLICATION layer raises — the ones that are
 * facts about the orchestration rather than about the aggregate (PR-07,
 * issue #73). The Booking aggregate never learns what a Service is (it
 * receives already-resolved snapshot values, see `domain/booking.ts`) and
 * `domain/booking-errors.ts` deliberately carries no request context, so
 * "this Service cannot be booked" and "here is the window you asked for"
 * both live here.
 *
 * Plain `Error` subclasses with no HTTP status and no `problem+json` slug,
 * exactly like `domain/booking-errors.ts`. `http/booking-problem.filter.ts`
 * maps both to the canonical `422 validation` on `serviceId`, which is what
 * `contracts/booking.contract.md` specifies for "inactive service" and what
 * Catalog already does for an unavailable `categoryId`
 * (`ServiceCategoryNotInWorkspaceError`).
 *
 * ## Why `unavailable` covers two situations and never distinguishes them
 *
 * The Service read runs under the caller's RLS-scoped transaction, so a
 * Service that does not exist and a Service belonging to another workspace
 * come back identically as `null` — this error cannot tell them apart even
 * if it wanted to, and neither can the response it becomes. That is the
 * point: no caller can use `POST /v1/bookings` to probe whether some id is a
 * real Service in some other tenant.
 *
 * `inactive` is a separate reason because an inactive Service is necessarily
 * one the caller's own workspace can already see and read through
 * `GET /v1/catalog/services/{id}`, so naming it leaks nothing and tells the
 * operator the actually-useful thing ("reactivate it, or pick another
 * service") instead of a flat "not available".
 */
import type { Temporal } from "@js-temporal/polyfill";

import { BookingOverlapError } from "../domain/booking-errors.js";
import type { ServiceReferenceId } from "../domain/ids.js";

export type BookingServiceUnavailableReason = "unavailable" | "inactive";

export class BookingServiceUnavailableError extends Error {
  override readonly name = "BookingServiceUnavailableError";

  constructor(
    readonly serviceId: ServiceReferenceId,
    readonly reason: BookingServiceUnavailableReason,
  ) {
    super(
      reason === "inactive"
        ? "the referenced service is not currently active"
        : "the referenced service is not available in the active workspace",
    );
  }
}

/**
 * A {@link BookingOverlapError} that also carries the half-open blocking
 * window the rejected request would have occupied — the caller's own
 * `startsAt` widened by the Service snapshot's buffers.
 *
 * `contracts/booking.contract.md` asks the overlap response to include "the
 * conflicting time context needed for the client to offer 'try another
 * slot'". On create the client cannot compute that window itself: it sent
 * only `serviceId` and `startsAt` and never saw the duration or the buffers.
 * So the server states what it tried to block.
 *
 * What this deliberately does NOT carry: anything about the booking that was
 * already there. No id, no time, no count, and no second query is issued to
 * find out — a caller holding `booking:create` is not thereby entitled to
 * learn when another confirmed booking runs, and no accepted artifact asks
 * for it. PR-06's pure-domain `BookingOverlapError` is left exactly as it
 * was; this subclass adds request context the application layer already has
 * in hand, never database or tenant detail.
 *
 * A subclass rather than a sibling so every existing `instanceof
 * BookingOverlapError` check — including the repository's own translation
 * boundary and the HTTP filter — keeps working unchanged.
 */
export class RequestedBookingOverlapError extends BookingOverlapError {
  // `name` is deliberately NOT overridden: PR-06 declared it as the literal
  // type `"BookingOverlapError"`, and narrowing a base class's literal
  // property is not a subtype relation. Nothing branches on `name` — the
  // filter and the repository both use `instanceof` — so leaving it inherited
  // costs nothing and avoids widening the merged error's declaration.
  constructor(
    readonly requestedStart: Temporal.Instant,
    readonly requestedEnd: Temporal.Instant,
  ) {
    super();
  }
}
