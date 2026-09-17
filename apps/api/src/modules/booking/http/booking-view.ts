/**
 * Record -> boundary-response projection for `/v1/bookings`, plus the
 * fail-closed read of the guard-resolved tenant context (PR-07, issue #73).
 * Same shape as `catalog/http/catalog-view.ts` and
 * `scheduling/http/scheduling-view.ts`.
 *
 * The projection is explicit rather than a spread of the repository record:
 * `BookingRecord` carries `workspaceId`, which no response body has any
 * reason to echo back, and a future column added to the record must not
 * silently appear in the public contract.
 */
import type { FastifyRequest } from "fastify";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { getRequestWorkspaceContext } from "../../identity/index.js";
import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import type { BookingRecord } from "../infrastructure/repositories/bookings.repository.js";
import type { BookingResponseBody } from "./booking.schema.js";

export function toBookingResponse(record: BookingRecord): BookingResponseBody {
  return {
    id: record.id,
    serviceId: record.serviceId,
    startsAt: record.startsAt.toString(),
    serviceDurationMinutes: record.serviceDurationMinutes,
    preBufferMinutes: record.preBufferMinutes,
    postBufferMinutes: record.postBufferMinutes,
    // The bounds the database itself computed for the generated
    // `blocking_range`, rendered as instants — never the PostgreSQL range
    // literal, and never the exclusion constraint's name.
    blockingRange: {
      start: record.blockingRangeStart.toString(),
      end: record.blockingRangeEnd.toString(),
    },
    status: record.status,
    version: record.version,
    cancelledReason: record.cancelledReason,
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
