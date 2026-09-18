/**
 * `GET /v1/calendar?from=&to=` (`contracts/calendar.contract.md`, PR-09,
 * issue #81).
 *
 * EXACTLY ONE endpoint, and it is a read. There is no POST, PATCH or DELETE
 * on this surface, no per-day/per-resource/per-location route, and no
 * Calendar identifier of any kind — Calendar owns no rows to identify.
 *
 * ## Both capabilities, not either
 *
 * The accepted contract gates this route on `booking:read` **and**
 * `scheduling:read`: "a user must be authorized to see both underlying
 * surfaces; the endpoint does not grant new access." `@RequireCapability`
 * takes both (PR-09 widened it to a list — see its header for why stacking
 * two decorators would have silently gated on one), and `CapabilityGuard`
 * requires EVERY listed capability. Holding one of the two is a 403, exactly
 * as holding neither is. Neither underlying rule is relaxed, and no default
 * role -> capability mapping is introduced: which membership roles receive
 * `booking:read`/`scheduling:read` remains the open Founder product decision
 * PR-02/PR-04/PR-07 all deliberately left open.
 *
 * As everywhere else in this API, the tenant is read from the
 * guard-resolved request context, never from a header, body or query
 * parameter, and no SQL is issued from this layer.
 */
import { Controller, Get, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { Temporal } from "@js-temporal/polyfill";
import { ZodResponse } from "nestjs-zod";
import type { FastifyRequest } from "fastify";

import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";
import { BOOKING_READ } from "../../booking/index.js";
import { CapabilityGuard, RequireCapability } from "../../identity/index.js";
import { SCHEDULING_READ } from "../../scheduling/index.js";
import { ComposeCalendarUseCase } from "../application/compose-calendar.use-case.js";
import { CalendarProblemFilter } from "./calendar-problem.filter.js";
import { requireWorkspaceContext, toCalendarResponse } from "./calendar-view.js";
import {
  CalendarResponseDto,
  calendarQuerySchema,
  type CalendarQuery,
  type CalendarResponseBody,
} from "./calendar.schema.js";

const PROBLEM_JSON_CONTENT = {
  "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
};

@Controller("v1/calendar")
@UseFilters(CalendarProblemFilter)
export class CalendarController {
  constructor(private readonly composeCalendar: ComposeCalendarUseCase) {}

  @Get()
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_READ, SCHEDULING_READ)
  @ApiOperation({
    summary: "Read the composed calendar for a bounded window",
    description:
      "A read composition over Scheduling's resolved availability and Booking's occupancy for the workspace's implicit resource — it persists nothing and owns no table. Returns the open intervals clipped to the half-open `[from, to)` window, and the bookings whose occupied interval (buffers included) overlaps it. A booking occupied across `from` is included; one adjacent at either bound is not. Cancelled bookings never appear: they occupy no time. The window is bounded by the same expansion horizon as `POST /v1/scheduling/availability/resolve`. Requires both `booking:read` and `scheduling:read`. There is no resource, staff, location or client dimension.",
  })
  @ApiQuery({ name: "from", required: true, type: "string", format: "date-time" })
  @ApiQuery({ name: "to", required: true, type: "string", format: "date-time" })
  @ZodResponse({ status: 200, type: CalendarResponseDto })
  @ApiResponse({
    status: 400,
    description: "Malformed or unknown query parameter (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description:
      "Missing `booking:read` or `scheduling:read` (both are required), or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description:
      "`to` is not strictly after `from`, or the window exceeds the expansion horizon (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 500,
    description:
      "An underlying Scheduling or Booking read failed (`internal`). The response is never partial calendar data.",
    content: PROBLEM_JSON_CONTENT,
  })
  async read(
    @Query(new ZodValidationPipe(calendarQuerySchema)) query: CalendarQuery,
    @Req() request: FastifyRequest,
  ): Promise<CalendarResponseBody> {
    const context = requireWorkspaceContext(request);
    const view = await this.composeCalendar.execute(context, {
      from: Temporal.Instant.from(query.from),
      to: Temporal.Instant.from(query.to),
    });
    return toCalendarResponse(view);
  }
}
