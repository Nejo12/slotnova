/**
 * `/v1/bookings` (`contracts/booking.contract.md`, PR-07, issue #73).
 *
 * EXACTLY the six approved endpoints and nothing else:
 *
 *   GET  /v1/bookings                  (`booking:read`)
 *   GET  /v1/bookings/:id              (`booking:read`)
 *   POST /v1/bookings                  (`booking:create`)
 *   POST /v1/bookings/:id/reschedule   (`booking:edit`)
 *   POST /v1/bookings/:id/cancel       (`booking:cancel`)
 *   POST /v1/bookings/:id/complete     (`booking:complete`)
 *
 * There is NO `POST /v1/bookings/:id/confirm` — creation lands directly at
 * `confirmed`, so there is no `pending` state to confirm from
 * (`contracts/booking.contract.md` "Not part of Phase 2") — and no DELETE: a
 * booking is cancelled, never deleted. No Calendar, Clients, resource,
 * location or staff route exists here, and none of those concepts is
 * referenced anywhere in this module.
 *
 * Path prefix: the contract writes these paths unversioned (`/bookings`), the
 * same informal notation it uses for `:id` rather than `{id}`. Every route
 * this API serves is under `v1/`, exactly as PR-02 and PR-04 already resolved
 * for Catalog and Scheduling.
 *
 * All six live in one controller because they are one bounded surface over
 * one module's one table; splitting them purely to mirror URL segments would
 * add indirection without adding a boundary.
 *
 * Authorization is the existing server-authoritative guard (`CapabilityGuard`
 * + `@RequireCapability`, ADR-009) — there is no controller-local
 * role/permission check anywhere in this file, and the workspace is read from
 * what that guard resolved, never from client input. CSRF for every `POST` is
 * enforced by the single global Fastify hook registered in `main.ts`, as for
 * every other state-changing route.
 *
 * Every handler reaches the database only through an application use case. No
 * SQL is issued from this layer, and no Catalog repository is touched — the
 * Service snapshot is Catalog's own port, consumed inside
 * `CreateBookingIdempotentlyUseCase`'s transaction.
 *
 * The four mutating routes are POSTs, never GETs (`tasks.md` PR-07: "no GET
 * for any mutating action").
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { Temporal } from "@js-temporal/polyfill";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";
import { CapabilityGuard, RequireCapability } from "../../identity/index.js";
import { fingerprintRequest } from "../../platform/idempotency/request-fingerprint.js";
import { createInterval } from "../../scheduling/index.js";
import { CancelBookingUseCase } from "../application/cancel-booking.use-case.js";
import { CompleteBookingUseCase } from "../application/complete-booking.use-case.js";
import { CreateBookingIdempotentlyUseCase } from "../application/create-booking-idempotently.use-case.js";
import { GetBookingUseCase, ListBookingsUseCase } from "../application/read-bookings.use-case.js";
import { RescheduleBookingUseCase } from "../application/reschedule-booking.use-case.js";
import { asBookingId, asServiceReferenceId } from "../domain/ids.js";
import {
  BOOKING_CANCEL,
  BOOKING_COMPLETE,
  BOOKING_CREATE,
  BOOKING_EDIT,
  BOOKING_READ,
} from "../domain/policy/capabilities.js";
import { BookingProblemFilter } from "./booking-problem.filter.js";
import { requireWorkspaceContext, toBookingResponse } from "./booking-view.js";
import {
  BookingListResponseDto,
  BookingResponseDto,
  CancelBookingRequestDto,
  CompleteBookingRequestDto,
  CreateBookingRequestDto,
  RescheduleBookingRequestDto,
  bookingIdParamSchema,
  listBookingsQuerySchema,
  type BookingListResponseBody,
  type BookingResponseBody,
  type CancelBookingRequestBody,
  type CompleteBookingRequestBody,
  type CreateBookingRequestBody,
  type ListBookingsQuery,
  type RescheduleBookingRequestBody,
} from "./booking.schema.js";

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
  description:
    "Malformed body/query or an unknown property — including `clientId`, `resourceId`, `locationId` and `staffId`, none of which exist in Phase 2 (`validation`).",
  content: PROBLEM_JSON_CONTENT,
} as const;

const NOT_FOUND = {
  status: 404,
  description:
    "No such booking in the active workspace (`not-found`). A booking belonging to another workspace is indistinguishable from one that does not exist.",
  content: PROBLEM_JSON_CONTENT,
} as const;

const STALE_WRITE = {
  status: 409,
  description:
    "`version` did not match the booking's current version (`stale-write`), or the command is not valid from its current state (`invalid-transition`).",
  content: PROBLEM_JSON_CONTENT,
} as const;

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
/** Bounded so an unbounded client-supplied string never reaches the database. Same limit as Catalog's. */
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

function forbidden(capability: string): {
  status: 403;
  description: string;
  content: typeof PROBLEM_JSON_CONTENT;
} {
  return {
    status: 403,
    description: `Missing \`${capability}\`, or no active workspace (\`forbidden\`).`,
    content: PROBLEM_JSON_CONTENT,
  };
}

@Controller("v1/bookings")
@UseFilters(BookingProblemFilter)
export class BookingsController {
  constructor(
    private readonly listBookings: ListBookingsUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly createBooking: CreateBookingIdempotentlyUseCase,
    private readonly rescheduleBooking: RescheduleBookingUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
    private readonly completeBooking: CompleteBookingUseCase,
  ) {}

  @Get()
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_READ)
  @ApiOperation({
    summary: "List this workspace's bookings in a bounded time window",
    description:
      "Returns every booking whose occupied interval (`blockingRange`) overlaps the half-open `[from, to)` window, ordered `startsAt` then `id`. A booking that starts before `from` is included when its duration or buffers reach into the window; one that ends exactly at `from`, or starts exactly at `to`, is adjacent and excluded. Both bounds are required — this endpoint never lists unbounded. There is no resource, staff, location or client filter, and no pagination cursor.",
  })
  @ApiQuery({ name: "from", required: true, type: "string", format: "date-time" })
  @ApiQuery({ name: "to", required: true, type: "string", format: "date-time" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["confirmed", "completed", "cancelled"],
  })
  @ZodResponse({ status: 200, type: BookingListResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(forbidden(BOOKING_READ))
  @ApiResponse({
    status: 422,
    description: "`to` is not strictly after `from` (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async list(
    @Query(new ZodValidationPipe(listBookingsQuerySchema)) query: ListBookingsQuery,
    @Req() request: FastifyRequest,
  ): Promise<BookingListResponseBody> {
    const context = requireWorkspaceContext(request);
    // The merged PR-03 interval algebra is the ONE place "a window must be
    // non-empty and half-open" is decided; an inverted range raises
    // `InvalidIntervalBoundsError`, which the filter reports as 422. The rule
    // is deliberately not re-encoded as a schema `.refine`.
    const window = createInterval(
      Temporal.Instant.from(query.from),
      Temporal.Instant.from(query.to),
    );
    const bookings = await this.listBookings.execute(context, {
      from: window.start,
      to: window.end,
      status: query.status,
    });
    return { items: bookings.map(toBookingResponse) };
  }

  @Get(":id")
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_READ)
  @ApiParam({ name: "id", type: "string", format: "uuid" })
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(forbidden(BOOKING_READ))
  @ApiResponse(NOT_FOUND)
  async detail(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @Req() request: FastifyRequest,
  ): Promise<BookingResponseBody> {
    const context = requireWorkspaceContext(request);
    const booking = await this.getBooking.execute(context, asBookingId(id));
    if (!booking) throw new ProblemException("not-found");
    return toBookingResponse(booking);
  }

  @Post()
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_CREATE)
  @ApiOperation({
    summary: "Create a booking, directly at `confirmed`",
    description:
      "The caller sends `serviceId` and `startsAt` only. The server reads the current Service and snapshots its duration and buffers; the blocking range and `confirmed`/version 1 are server-derived and cannot be supplied. There is no draft or pending state, and no `/confirm` step.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description:
      "Client-supplied replay key. Retrying with the same key and the same body returns the original 201 response and creates no second booking (and no spurious overlap conflict against the booking it already created); the same key with a materially different body is a 409 conflict.",
  })
  @ApiBody({ type: CreateBookingRequestDto })
  @ZodResponse({ status: 201, type: BookingResponseDto })
  @ApiResponse({
    status: 400,
    description:
      "Malformed body, an unknown property (`clientId`/`resourceId`/`locationId`/`staffId` included), or a missing `Idempotency-Key` (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(forbidden(BOOKING_CREATE))
  @ApiResponse({
    status: 409,
    description:
      "The requested window overlaps an existing confirmed booking (`booking-overlap`), or the `Idempotency-Key` was reused with a different request (`idempotency-conflict`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description:
      "The referenced service is unavailable in this workspace or is not active (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async create(
    @Body(new ZodValidationPipe(CreateBookingRequestDto)) body: CreateBookingRequestBody,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<BookingResponseBody> {
    const context = requireWorkspaceContext(request);
    const key = assertIdempotencyKey(idempotencyKey);
    const startsAt = Temporal.Instant.from(body.startsAt);

    // Fingerprint the ACCEPTED, post-parse payload — not the raw bytes — so
    // two requests differing only in property order, whitespace or UTC-offset
    // spelling replay each other, while any material difference conflicts.
    // `startsAt` is normalized through `Temporal.Instant` first: the same
    // instant written `...T09:00:00Z` and `...T10:00:00+01:00` would create
    // the identical booking, so it must fingerprint identically too.
    // `.strict()` on the schema is what stops an unknown property being
    // dropped and silently fingerprinting as equal.
    const requestFingerprint = fingerprintRequest({
      serviceId: body.serviceId,
      startsAt: startsAt.toString(),
    });

    const result = await this.createBooking.execute(
      context,
      { serviceId: asServiceReferenceId(body.serviceId), startsAt },
      { idempotencyKey: key, requestFingerprint },
      (booking) => ({ status: 201, body: toBookingResponse(booking) }),
    );

    // A replay returns the stored status/body verbatim, so a retry is
    // indistinguishable from the original call.
    reply.status(result.response.status);
    // A replayed body comes back out of `jsonb`, so it is statically
    // `unknown`; it is by construction the exact body this same handler
    // rendered on the original call (`render` above is the only writer).
    return result.response.body as BookingResponseBody;
  }

  @Post(":id/reschedule")
  @HttpCode(200)
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_EDIT)
  @ApiOperation({
    summary: "Move a confirmed booking to a new time",
    description:
      "Changes `startsAt` and nothing else. The Service snapshot is NOT re-read: `serviceId`, duration and both buffers are preserved exactly, so a later Service edit never retroactively changes an existing booking's blocking window. Not idempotent — each reschedule is a distinct intent, guarded only by `version`.",
  })
  @ApiParam({ name: "id", type: "string", format: "uuid" })
  @ApiBody({ type: RescheduleBookingRequestDto })
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(forbidden(BOOKING_EDIT))
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      "The new window overlaps an existing confirmed booking (`booking-overlap`), `version` was stale (`stale-write`), or the booking is no longer `confirmed` (`invalid-transition`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async reschedule(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(RescheduleBookingRequestDto)) body: RescheduleBookingRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<BookingResponseBody> {
    const context = requireWorkspaceContext(request);
    const updated = await this.rescheduleBooking.execute(context, {
      bookingId: asBookingId(id),
      expectedVersion: body.version,
      startsAt: Temporal.Instant.from(body.startsAt),
    });
    return toBookingResponse(updated);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_CANCEL)
  @ApiOperation({
    summary: "Cancel a booking",
    description:
      "Founder-ratified semantics: `confirmed` + matching version -> `cancelled` at version + 1; already `cancelled` + matching CURRENT version -> 200 with the current booking and NO write at all (version, `updated_at` and `cancelledReason` are untouched); a stale version -> `stale-write`; a `completed` booking -> `invalid-transition`. The row and its historical blocking range are preserved — capacity is released by the state change alone.",
  })
  @ApiParam({ name: "id", type: "string", format: "uuid" })
  @ApiBody({ type: CancelBookingRequestDto })
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(forbidden(BOOKING_CANCEL))
  @ApiResponse(NOT_FOUND)
  @ApiResponse(STALE_WRITE)
  async cancel(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CancelBookingRequestDto)) body: CancelBookingRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<BookingResponseBody> {
    const context = requireWorkspaceContext(request);
    const updated = await this.cancelBooking.execute(context, {
      bookingId: asBookingId(id),
      expectedVersion: body.version,
      // `null` rather than `undefined` at the application boundary: a reason
      // is absent, not unspecified.
      reason: body.reason ?? null,
    });
    return toBookingResponse(updated);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @UseGuards(CapabilityGuard)
  @RequireCapability(BOOKING_COMPLETE)
  @ApiOperation({
    summary: "Mark a booking completed",
    description:
      "Founder-ratified semantics: `confirmed` + matching version -> `completed` at version + 1; already `completed` + matching CURRENT version -> 200 with the current booking and NO write; a stale version -> `stale-write`; a `cancelled` booking -> `invalid-transition`. A completed booking stays a historical record — nothing is deleted.",
  })
  @ApiParam({ name: "id", type: "string", format: "uuid" })
  @ApiBody({ type: CompleteBookingRequestDto })
  @ZodResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse(MALFORMED)
  @ApiResponse(UNAUTHENTICATED)
  @ApiResponse(forbidden(BOOKING_COMPLETE))
  @ApiResponse(NOT_FOUND)
  @ApiResponse(STALE_WRITE)
  async complete(
    @Param("id", new ZodValidationPipe(bookingIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CompleteBookingRequestDto)) body: CompleteBookingRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<BookingResponseBody> {
    const context = requireWorkspaceContext(request);
    const updated = await this.completeBooking.execute(context, {
      bookingId: asBookingId(id),
      expectedVersion: body.version,
    });
    return toBookingResponse(updated);
  }
}

/**
 * The contract makes `Idempotency-Key` mandatory for booking creation, so a
 * missing/blank one is an ordinary request-validation failure, reported
 * through the same `validation` problem as a malformed body rather than a
 * bespoke error shape. Identical to Catalog's rule for
 * `POST /v1/catalog/services`.
 */
function assertIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new ProblemException("validation", {
      errors: [
        {
          path: "Idempotency-Key",
          message: `header is required and must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
        },
      ],
    });
  }
  return key;
}
