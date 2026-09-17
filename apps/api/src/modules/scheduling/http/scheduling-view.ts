/**
 * Record -> boundary-response projection for `/v1/scheduling/*`, plus the
 * fail-closed read of the guard-resolved tenant context (PR-04, issue #66) —
 * same shape as `catalog/http/catalog-view.ts`.
 *
 * The projection is explicit rather than a spread of the repository record:
 * every record carries `workspaceId`, which no response body has any reason
 * to echo back, and a future column added to a record must not silently
 * appear in the public contract.
 *
 * Instants are rendered by `Temporal.Instant#toString()`, which always emits
 * UTC (`...Z`) — the contract's "`[start,end)` UTC instants". No `Date` is
 * constructed and no manual offset arithmetic happens anywhere here.
 */
import type { FastifyRequest } from "fastify";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { getRequestWorkspaceContext } from "../../identity/index.js";
import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import type { Interval } from "../domain/interval.js";
import type { AvailabilityExceptionRecord } from "../infrastructure/repositories/availability-exceptions.repository.js";
import type { AvailabilityPatternRecord } from "../infrastructure/repositories/availability-patterns.repository.js";
import type {
  AvailabilityExceptionResponseBody,
  AvailabilityPatternResponseBody,
  ResolveAvailabilityResponseBody,
} from "./scheduling.schema.js";

export function toAvailabilityPatternResponse(
  record: AvailabilityPatternRecord,
): AvailabilityPatternResponseBody {
  return {
    id: record.id,
    timezone: record.timezone,
    weeklyRule: record.weeklyRule.map((rule) => ({
      dayOfWeek: rule.dayOfWeek,
      startMinuteOfDay: rule.startMinuteOfDay,
      endMinuteOfDay: rule.endMinuteOfDay,
    })),
    effectiveFrom: record.effectiveFrom?.toString() ?? null,
    effectiveUntil: record.effectiveUntil?.toString() ?? null,
  };
}

export function toAvailabilityExceptionResponse(
  record: AvailabilityExceptionRecord,
): AvailabilityExceptionResponseBody {
  return {
    id: record.id,
    startsAt: record.startsAt.toString(),
    endsAt: record.endsAt.toString(),
    reason: record.reason,
  };
}

export function toResolvedAvailabilityResponse(
  intervals: readonly Interval[],
): ResolveAvailabilityResponseBody {
  return {
    intervals: intervals.map((interval) => ({
      start: interval.start.toString(),
      end: interval.end.toString(),
    })),
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
