/**
 * Maps the failures Scheduling's domain/application layers raise onto the
 * API's existing `problem+json` catalogue (`apps/api/src/http/problem/**`,
 * `contracts/problem+json.contract.md`) — PR-04, issue #66. Same shape as
 * `catalog/http/catalog-problem.filter.ts`: a thin translation over the
 * canonical {@link ProblemExceptionFilter}, never a second error envelope.
 *
 * It rewrites only the exceptions it recognises into a
 * {@link ProblemException} and hands everything else to the existing filter
 * untouched, so an unrecognised throwable still becomes the generic
 * `internal` 500 with the real error logged server-side only. No PostgreSQL
 * error text, SQL fragment, table name, Temporal internal exception or id
 * belonging to another workspace can reach a response through here — the
 * mapped messages below are the domain's own operator-facing wording, and
 * every unmapped case is deliberately opaque.
 *
 * The categories are exactly the four the contract implies: 401 (no session,
 * raised upstream by the session/CSRF layer), 403 (missing capability, raised
 * by `CapabilityGuard`), 422 (Scheduling validation, below) and 500 (unknown).
 * No new slug is invented.
 */
import { Catch } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { ProblemExceptionFilter } from "../../../http/problem/problem.filter.js";
import { OverlappingEffectivePatternError } from "../application/create-availability-pattern.use-case.js";
import {
  ExpansionHorizonExceededError,
  InvalidEffectiveRangeError,
  InvalidExpansionRangeError,
  InvalidIntervalBoundsError,
  InvalidLocalTimeRangeError,
  InvalidTimeZoneError,
  InvalidWeeklyAvailabilityRuleError,
} from "../domain/scheduling-errors.js";

/**
 * Domain-invariant violations are the `validation` problem at 422 — the
 * status `contracts/scheduling.contract.md` specifies for an invalid
 * timezone, overlapping weekly intervals, `startsAt >= endsAt` and a range
 * exceeding the expansion horizon — as opposed to the catalogue's 400
 * default, which stays reserved for a request malformed at the schema level.
 */
const UNPROCESSABLE = 422;

function validationProblem(path: string, message: string): ProblemException {
  return new ProblemException("validation", {
    status: UNPROCESSABLE,
    errors: [{ path, message }],
  });
}

export function toSchedulingProblem(exception: unknown): unknown {
  if (exception instanceof InvalidTimeZoneError) {
    return validationProblem("timezone", exception.message);
  }
  if (exception instanceof InvalidWeeklyAvailabilityRuleError) {
    return validationProblem("weeklyRule", exception.message);
  }
  if (exception instanceof InvalidLocalTimeRangeError) {
    return validationProblem("weeklyRule", exception.message);
  }
  if (exception instanceof InvalidEffectiveRangeError) {
    return validationProblem("effectiveUntil", exception.message);
  }
  if (exception instanceof OverlappingEffectivePatternError) {
    // No id/date echoed: the operator needs to know the window clashes, not
    // which stored row it clashed with.
    return validationProblem("effectiveFrom", exception.message);
  }
  if (exception instanceof InvalidIntervalBoundsError) {
    // The only interval a caller supplies directly is the exception's own.
    return validationProblem("endsAt", exception.message);
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
export class SchedulingProblemFilter extends ProblemExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(toSchedulingProblem(exception), host);
  }
}
