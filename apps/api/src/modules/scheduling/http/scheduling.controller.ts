/**
 * `/v1/scheduling/*` (`contracts/scheduling.contract.md`, PR-04, issue #66).
 *
 * EXACTLY the four approved endpoints and nothing else:
 *
 *   GET  /v1/scheduling/availability-patterns    (`scheduling:read`)
 *   POST /v1/scheduling/availability-patterns    (`scheduling:manage`)
 *   POST /v1/scheduling/availability-exceptions  (`scheduling:manage`)
 *   POST /v1/scheduling/availability/resolve     (`scheduling:read`)
 *
 * No update, delete, per-day, per-resource, per-location or calendar route
 * exists here — and no Booking, Calendar or Catalog concept is referenced
 * anywhere in this module.
 *
 * All four are kept in one controller because they are one bounded surface
 * over one module's two tables, and splitting four handlers across three
 * classes purely to mirror the URL segments would add indirection without
 * adding a boundary.
 *
 * `POST /availability/resolve` is a POST that mutates nothing — the contract
 * records this as a documented exception (the request body exceeds
 * comfortable query-string encoding and leaves room for future computation
 * cost controls), not a violation of the no-GET-for-mutation rule, which is
 * about the converse. It is gated on `scheduling:read` accordingly, and its
 * use case opens a read-only transaction.
 *
 * `Idempotency-Key` is deliberately not required on either create: the
 * approved contract asks for it on `POST /catalog/services` only, and
 * inventing replay semantics here would be contract this PR was not given.
 *
 * Every handler reads its tenant from the guard-resolved request context
 * (`requireWorkspaceContext`) — never from a header, body or query parameter
 * — and reaches the database only through an application use case. No SQL is
 * issued from this layer.
 */
import { Body, Controller, Get, HttpCode, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { Temporal } from "@js-temporal/polyfill";
import { ZodResponse } from "nestjs-zod";
import type { FastifyRequest } from "fastify";

import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";
import { CapabilityGuard, RequireCapability } from "../../identity/index.js";
import { CreateAvailabilityExceptionUseCase } from "../application/create-availability-exception.use-case.js";
import { CreateAvailabilityPatternUseCase } from "../application/create-availability-pattern.use-case.js";
import { ListAvailabilityPatternsUseCase } from "../application/list-availability-patterns.use-case.js";
import { ResolveAvailabilityUseCase } from "../application/resolve-availability.use-case.js";
import { SCHEDULING_MANAGE, SCHEDULING_READ } from "../domain/policy/capabilities.js";
import { SchedulingProblemFilter } from "./scheduling-problem.filter.js";
import {
  requireWorkspaceContext,
  toAvailabilityExceptionResponse,
  toAvailabilityPatternResponse,
  toResolvedAvailabilityResponse,
} from "./scheduling-view.js";
import {
  AvailabilityExceptionResponseDto,
  AvailabilityPatternListResponseDto,
  AvailabilityPatternResponseDto,
  CreateAvailabilityExceptionRequestDto,
  CreateAvailabilityPatternRequestDto,
  ResolveAvailabilityRequestDto,
  ResolveAvailabilityResponseDto,
  type AvailabilityExceptionResponseBody,
  type AvailabilityPatternListResponseBody,
  type AvailabilityPatternResponseBody,
  type CreateAvailabilityExceptionRequestBody,
  type CreateAvailabilityPatternRequestBody,
  type ResolveAvailabilityRequestBody,
  type ResolveAvailabilityResponseBody,
} from "./scheduling.schema.js";

const PROBLEM_JSON_CONTENT = {
  "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
};

const UNAUTHENTICATED = {
  status: 401,
  description: "No/invalid session (`session-invalid`).",
  content: PROBLEM_JSON_CONTENT,
} as const;

const MALFORMED = {
  status: 400,
  description: "Malformed body or unknown property (`validation`).",
  content: PROBLEM_JSON_CONTENT,
} as const;

/** `null` rather than `undefined` at the application boundary: a bound is absent, not unspecified. */
function optionalDate(value: string | undefined): Temporal.PlainDate | null {
  return value === undefined ? null : Temporal.PlainDate.from(value);
}

@Controller("v1/scheduling")
@UseFilters(SchedulingProblemFilter)
export class SchedulingController {
  constructor(
    private readonly listPatterns: ListAvailabilityPatternsUseCase,
    private readonly createPattern: CreateAvailabilityPatternUseCase,
    private readonly createException: CreateAvailabilityExceptionUseCase,
    private readonly resolveAvailability: ResolveAvailabilityUseCase,
  ) {}

  @Get("availability-patterns")
  @UseGuards(CapabilityGuard)
  @RequireCapability(SCHEDULING_READ)
  @ApiOperation({
    summary: "List this workspace's availability patterns",
    description:
      "Returned as a list to allow effective-dated pattern history. Ordered oldest effective window first; effective windows never overlap, so at most one pattern applies to any given date.",
  })
  @ZodResponse({ status: 200, type: AvailabilityPatternListResponseDto })
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse({
    status: 403,
    description: "Missing `scheduling:read`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async list(@Req() request: FastifyRequest): Promise<AvailabilityPatternListResponseBody> {
    const context = requireWorkspaceContext(request);
    const patterns = await this.listPatterns.execute(context);
    return { items: patterns.map(toAvailabilityPatternResponse) };
  }

  @Post("availability-patterns")
  @UseGuards(CapabilityGuard)
  @RequireCapability(SCHEDULING_MANAGE)
  @ApiOperation({
    summary: "Create an availability pattern",
    description:
      "`effectiveUntil` is EXCLUSIVE: `2026-10-01` produces no availability on 2026-10-01. The effective window must not overlap an existing pattern's.",
  })
  @ApiBody({ type: CreateAvailabilityPatternRequestDto })
  @ZodResponse({ status: 201, type: AvailabilityPatternResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse({
    status: 403,
    description: "Missing `scheduling:manage`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description:
      "Invalid IANA timezone, weekly rules overlapping within a day, an inverted effective window, or an effective window overlapping an existing pattern (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async createAvailabilityPattern(
    @Body(new ZodValidationPipe(CreateAvailabilityPatternRequestDto))
    body: CreateAvailabilityPatternRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<AvailabilityPatternResponseBody> {
    const context = requireWorkspaceContext(request);
    const created = await this.createPattern.execute(context, {
      timezone: body.timezone,
      weeklyRule: body.weeklyRule,
      effectiveFrom: optionalDate(body.effectiveFrom),
      effectiveUntil: optionalDate(body.effectiveUntil),
    });
    return toAvailabilityPatternResponse(created);
  }

  @Post("availability-exceptions")
  @UseGuards(CapabilityGuard)
  @RequireCapability(SCHEDULING_MANAGE)
  @ApiOperation({
    summary: "Create a time-off exception",
    description:
      "Always resolved instants — `[startsAt, endsAt)`, half-open, never a recurring rule. An exception always subtracts from the recurring pattern for its overlapping span.",
  })
  @ApiBody({ type: CreateAvailabilityExceptionRequestDto })
  @ZodResponse({ status: 201, type: AvailabilityExceptionResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse({
    status: 403,
    description: "Missing `scheduling:manage`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description: "`startsAt` is not strictly before `endsAt` (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async createAvailabilityException(
    @Body(new ZodValidationPipe(CreateAvailabilityExceptionRequestDto))
    body: CreateAvailabilityExceptionRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<AvailabilityExceptionResponseBody> {
    const context = requireWorkspaceContext(request);
    const created = await this.createException.execute(context, {
      startsAt: Temporal.Instant.from(body.startsAt),
      endsAt: Temporal.Instant.from(body.endsAt),
      reason: body.reason ?? null,
    });
    return toAvailabilityExceptionResponse(created);
  }

  @Post("availability/resolve")
  @HttpCode(200)
  @UseGuards(CapabilityGuard)
  @RequireCapability(SCHEDULING_READ)
  @ApiOperation({
    summary: "Resolve availability over a bounded date range",
    description:
      "Pure computation — persists nothing. Expands the effective recurring pattern(s) over the half-open local-date window `[from, to)`, subtracts overlapping exceptions, and returns normalised half-open UTC instant intervals. The window may not exceed 370 days.",
  })
  @ApiBody({ type: ResolveAvailabilityRequestDto })
  @ZodResponse({ status: 200, type: ResolveAvailabilityResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse({
    status: 403,
    description: "Missing `scheduling:read`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description:
      "`from` is not strictly before `to`, or the window exceeds 370 days (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async resolve(
    @Body(new ZodValidationPipe(ResolveAvailabilityRequestDto))
    body: ResolveAvailabilityRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<ResolveAvailabilityResponseBody> {
    const context = requireWorkspaceContext(request);
    const intervals = await this.resolveAvailability.execute(context, {
      from: Temporal.PlainDate.from(body.from),
      to: Temporal.PlainDate.from(body.to),
    });
    return toResolvedAvailabilityResponse(intervals);
  }
}
