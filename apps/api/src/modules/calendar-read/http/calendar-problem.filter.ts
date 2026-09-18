/**
 * Maps the failures the Calendar composition can raise onto the API's
 * existing `problem+json` catalogue (`apps/api/src/http/problem/**`,
 * `contracts/problem+json.contract.md`) — PR-09, issue #81. Same shape as
 * `scheduling/http/scheduling-problem.filter.ts` and
 * `booking/http/booking-problem.filter.ts`: a thin translation over the
 * canonical {@link ProblemExceptionFilter}, never a second error envelope.
 *
 * ## Exactly three categories, and no invented slug
 *
 * - **422 `validation`** — a bad REQUEST WINDOW, and only that: an inverted
 *   or empty `[from, to)` (`InvalidIntervalBoundsError`,
 *   `InvalidExpansionRangeError`) or one whose expansion would exceed
 *   Scheduling's 370-day safety horizon (`ExpansionHorizonExceededError`).
 *   All three are raised by the merged PR-03 domain, through Scheduling's
 *   own read port, before any database access.
 * - **401/403** — raised upstream by the session layer and `CapabilityGuard`
 *   respectively. Calendar adds nothing to either; in particular a missing
 *   capability NEVER becomes an empty Calendar.
 * - **500 `internal`** — everything else, opaquely. A Scheduling pattern row
 *   that no longer satisfies its own domain invariants, a database failure
 *   on either side, anything unrecognised: the generic `internal` problem,
 *   with the real error logged server-side only. No PostgreSQL text, SQL
 *   fragment, table name or another workspace's id can reach a response.
 *
 * ## Why 500 and not 502/503
 *
 * `contracts/calendar.contract.md` words the underlying-failure case as
 * "`502`/`503`-mapped problem+json", written when the composition's two
 * halves were imagined as calls that could be out of process. In the shipped
 * modular monolith both halves are in-process application ports, so a
 * failure in either is this API's own fault, not a failed upstream hop —
 * `internal`/500 is the catalogue's existing, accurate slug for that, and
 * inventing a `bad-gateway` slug would tell clients something untrue about
 * where the failure happened. What the contract actually requires of the
 * behaviour is unchanged and is honoured: the response is canonical
 * problem+json, it is NOT partial data, and the frontend renders it as an
 * explicit error+retry state distinguishable from empty (FR-032).
 */
import { Catch } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { ProblemExceptionFilter } from "../../../http/problem/problem.filter.js";
import {
  ExpansionHorizonExceededError,
  InvalidExpansionRangeError,
  InvalidIntervalBoundsError,
} from "../../scheduling/index.js";

/** The status `contracts/scheduling.contract.md` gives an out-of-horizon or inverted range. */
const UNPROCESSABLE = 422;

function validationProblem(path: string, message: string): ProblemException {
  return new ProblemException("validation", {
    status: UNPROCESSABLE,
    errors: [{ path, message }],
  });
}

export function toCalendarProblem(exception: unknown): unknown {
  if (exception instanceof InvalidIntervalBoundsError) {
    return validationProblem("to", exception.message);
  }
  if (exception instanceof InvalidExpansionRangeError) {
    return validationProblem("to", exception.message);
  }
  if (exception instanceof ExpansionHorizonExceededError) {
    return validationProblem("to", exception.message);
  }
  return exception;
}

@Catch()
export class CalendarProblemFilter extends ProblemExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(toCalendarProblem(exception), host);
  }
}
