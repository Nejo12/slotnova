/**
 * Composed-view -> boundary-response projection for `GET /v1/calendar`, plus
 * the fail-closed read of the guard-resolved tenant context (PR-09, issue
 * #81). Same shape as `booking/http/booking-view.ts` and
 * `scheduling/http/scheduling-view.ts`.
 *
 * The projection is explicit rather than a spread: a future field added to
 * the ports' summaries must not silently appear in the public contract.
 *
 * Instants are rendered by `Temporal.Instant#toString()`, which always emits
 * UTC (`...Z`). No `Date` is constructed and no offset arithmetic happens
 * anywhere here (ADR-010).
 */
import type { FastifyRequest } from "fastify";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import type { OccupiedBooking } from "../../booking/index.js";
import { getRequestWorkspaceContext } from "../../identity/index.js";
import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import type { Interval } from "../../scheduling/index.js";
import type { CalendarView } from "../application/compose-calendar.use-case.js";
import type { CalendarResponseBody } from "./calendar.schema.js";

function toInterval(interval: Interval): { start: string; end: string } {
  return { start: interval.start.toString(), end: interval.end.toString() };
}

function toOccupiedEntry(entry: OccupiedBooking): CalendarResponseBody["occupied"][number] {
  return {
    bookingId: entry.bookingId,
    serviceId: entry.serviceId,
    startsAt: entry.startsAt.toString(),
    occupied: { start: entry.occupiedFrom.toString(), end: entry.occupiedUntil.toString() },
    status: entry.status,
  };
}

export function toCalendarResponse(view: CalendarView): CalendarResponseBody {
  return {
    range: toInterval(view.range),
    open: view.open.map(toInterval),
    occupied: view.occupied.map(toOccupiedEntry),
  };
}

/**
 * The active workspace/user as the `CapabilityGuard` resolved them — never
 * from a header, body, or query parameter. Absence means the route was not
 * capability-gated (a wiring mistake): fail closed with the same
 * `session-invalid` every other unauthenticated path returns rather than
 * running tenant work with no tenant.
 */
export function requireWorkspaceContext(request: FastifyRequest): WorkspaceContext {
  const context = getRequestWorkspaceContext(request);
  if (!context) throw new ProblemException("session-invalid");
  return { workspaceId: context.workspaceId, userId: context.userId };
}
