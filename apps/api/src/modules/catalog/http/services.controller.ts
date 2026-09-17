/**
 * `/v1/catalog/services` (`contracts/catalog.contract.md`, PR-02, issue #60).
 *
 * Path prefix: the contract writes these paths unversioned (`/catalog/
 * services`), the same informal notation it uses for `:id` rather than
 * `{id}`. Every route this API actually serves is under `v1/`
 * (`/v1/me`, `/v1/auth/session`, `/v1/invitations`), so introducing the
 * first unversioned product route would be the deviation, not this.
 *
 * Authorization is the existing server-authoritative guard
 * (`CapabilityGuard` + `@RequireCapability`, ADR-009) — there is no
 * controller-local role/permission check anywhere in this file, and the
 * workspace is read from what that guard resolved, never from client input.
 *
 * CSRF for `POST`/`PATCH` is enforced by the single global Fastify hook
 * registered in `main.ts`, exactly as for every other state-changing route;
 * as with `SessionController`, it is not documented per-route here because
 * it lives outside `@nestjs/swagger`'s controller introspection.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
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
  ApiParam,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";
import { CapabilityGuard, RequireCapability } from "../../identity/index.js";
import { fingerprintRequest } from "../../platform/idempotency/request-fingerprint.js";
import { CreateServiceIdempotentlyUseCase } from "../application/create-service-idempotently.use-case.js";
import { GetServiceUseCase, ListServicesUseCase } from "../application/read-catalog.use-case.js";
import { UpdateServiceUseCase } from "../application/update-service.use-case.js";
import { asServiceCategoryId, asServiceId } from "../domain/ids.js";
import { CATALOG_MANAGE, CATALOG_READ } from "../domain/policy/capabilities.js";
import type { ServiceUpdateInput } from "../domain/service.js";
import { CatalogProblemFilter } from "./catalog-problem.filter.js";
import { requireWorkspaceContext, toServiceResponse } from "./catalog-view.js";
import {
  CreateServiceRequestDto,
  ServiceListResponseDto,
  ServiceResponseDto,
  UpdateServiceRequestDto,
  listServicesQuerySchema,
  serviceIdParamSchema,
  type CreateServiceRequestBody,
  type ListServicesQuery,
  type ServiceListResponseBody,
  type ServiceResponseBody,
  type UpdateServiceRequestBody,
} from "./catalog.schema.js";

const PROBLEM_JSON_CONTENT = {
  "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
};

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
/** Bounded so an unbounded client-supplied string never reaches the database. */
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

@Controller("v1/catalog/services")
@UseFilters(CatalogProblemFilter)
export class ServicesController {
  constructor(
    private readonly listServices: ListServicesUseCase,
    private readonly getService: GetServiceUseCase,
    private readonly createService: CreateServiceIdempotentlyUseCase,
    private readonly updateService: UpdateServiceUseCase,
  ) {}

  @Get()
  @UseGuards(CapabilityGuard)
  @RequireCapability(CATALOG_READ)
  @ApiQuery({ name: "active", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "cursor", required: false, type: "string", format: "uuid" })
  @ApiQuery({ name: "limit", required: false, type: "integer" })
  @ZodResponse({ status: 200, type: ServiceListResponseDto })
  @ApiResponse({
    status: 400,
    description: "Malformed query parameter (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `catalog:read`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async list(
    @Query(new ZodValidationPipe(listServicesQuerySchema)) query: ListServicesQuery,
    @Req() request: FastifyRequest,
  ): Promise<ServiceListResponseBody> {
    const context = requireWorkspaceContext(request);
    // One extra row is the page-exhausted probe: it tells us whether a next
    // page exists without a second COUNT query, and it is discarded below.
    const rows = await this.listServices.execute(context, {
      active: query.active,
      cursor: query.cursor === undefined ? undefined : asServiceId(query.cursor),
      limit: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const nextCursor = rows.length > query.limit ? (items.at(-1)?.id ?? null) : null;
    return { items: items.map(toServiceResponse), nextCursor };
  }

  @Get(":id")
  @UseGuards(CapabilityGuard)
  @RequireCapability(CATALOG_READ)
  @ApiParam({ name: "id", type: "string", format: "uuid" })
  @ZodResponse({ status: 200, type: ServiceResponseDto })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `catalog:read`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 404,
    description:
      "No such service in the active workspace (`not-found`). A service belonging to another workspace is indistinguishable from one that does not exist.",
    content: PROBLEM_JSON_CONTENT,
  })
  async detail(
    @Param("id", new ZodValidationPipe(serviceIdParamSchema)) id: string,
    @Req() request: FastifyRequest,
  ): Promise<ServiceResponseBody> {
    const context = requireWorkspaceContext(request);
    const service = await this.getService.execute(context, asServiceId(id));
    if (!service) throw new ProblemException("not-found");
    return toServiceResponse(service);
  }

  @Post()
  @UseGuards(CapabilityGuard)
  @RequireCapability(CATALOG_MANAGE)
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description:
      "Client-supplied replay key. Retrying with the same key and the same body returns the original 201 response and creates no second service; the same key with a materially different body is a 409 conflict.",
  })
  @ApiBody({ type: CreateServiceRequestDto })
  @ZodResponse({ status: 201, type: ServiceResponseDto })
  @ApiResponse({
    status: 400,
    description: "Malformed body, unknown property, or missing `Idempotency-Key` (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `catalog:manage`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 409,
    description: "`Idempotency-Key` reused with a different request (`idempotency-conflict`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description:
      "Duration/buffer/price/currency invariant violated, or an unavailable category (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async create(
    @Body(new ZodValidationPipe(CreateServiceRequestDto)) body: CreateServiceRequestBody,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ServiceResponseBody> {
    const context = requireWorkspaceContext(request);
    const key = assertIdempotencyKey(idempotencyKey);

    // Fingerprint the ACCEPTED, post-parse payload — not the raw bytes — so
    // two requests differing only in property order or whitespace replay
    // each other, while any material difference conflicts. `.strict()` on
    // the schema is what stops an unknown property being dropped and
    // silently fingerprinting as equal. Absent optional fields are omitted
    // rather than sent as `undefined`, which JSON has no representation for.
    const requestFingerprint = fingerprintRequest({
      name: body.name,
      durationMinutes: body.durationMinutes,
      priceAmountMinor: body.priceAmountMinor,
      priceCurrency: body.priceCurrency,
      ...(body.categoryId === undefined ? {} : { categoryId: body.categoryId }),
      ...(body.preBufferMinutes === undefined ? {} : { preBufferMinutes: body.preBufferMinutes }),
      ...(body.postBufferMinutes === undefined
        ? {}
        : { postBufferMinutes: body.postBufferMinutes }),
    });

    const result = await this.createService.execute(
      context,
      {
        name: body.name,
        categoryId:
          body.categoryId === undefined ? undefined : asServiceCategoryId(body.categoryId),
        durationMinutes: body.durationMinutes,
        preBufferMinutes: body.preBufferMinutes,
        postBufferMinutes: body.postBufferMinutes,
        price: { amountMinor: body.priceAmountMinor, currency: body.priceCurrency },
      },
      { idempotencyKey: key, requestFingerprint },
      (service) => ({ status: 201, body: toServiceResponse(service) }),
    );

    // A replay returns the stored status/body verbatim, so a retry is
    // indistinguishable from the original call.
    reply.status(result.response.status);
    // A replayed body comes back out of `jsonb`, so it is statically
    // `unknown`; it is by construction the exact body this same handler
    // rendered on the original call (`render` above is the only writer).
    return result.response.body as ServiceResponseBody;
  }

  @Patch(":id")
  @UseGuards(CapabilityGuard)
  @RequireCapability(CATALOG_MANAGE)
  @ApiParam({ name: "id", type: "string", format: "uuid" })
  @ApiBody({ type: UpdateServiceRequestDto })
  @ZodResponse({ status: 200, type: ServiceResponseDto })
  @ApiResponse({
    status: 400,
    description: "Malformed body or unknown property (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `catalog:manage`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 404,
    description: "No such service in the active workspace (`not-found`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description:
      "Duration/buffer/price/currency invariant violated, or an unavailable category (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async update(
    @Param("id", new ZodValidationPipe(serviceIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateServiceRequestDto)) body: UpdateServiceRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<ServiceResponseBody> {
    const context = requireWorkspaceContext(request);
    const input: ServiceUpdateInput = {
      name: body.name,
      categoryId:
        body.categoryId === undefined || body.categoryId === null
          ? body.categoryId
          : asServiceCategoryId(body.categoryId),
      durationMinutes: body.durationMinutes,
      preBufferMinutes: body.preBufferMinutes,
      postBufferMinutes: body.postBufferMinutes,
      // The schema already guarantees these are both present or both
      // absent, so there is no half-updated price to guard against here.
      price:
        body.priceAmountMinor === undefined || body.priceCurrency === undefined
          ? undefined
          : { amountMinor: body.priceAmountMinor, currency: body.priceCurrency },
      active: body.active,
    };
    const updated = await this.updateService.execute(context, asServiceId(id), input);
    return toServiceResponse(updated);
  }
}

/**
 * The contract makes `Idempotency-Key` mandatory for this endpoint, so a
 * missing/blank one is an ordinary request-validation failure, reported
 * through the same `validation` problem as a malformed body rather than a
 * bespoke error shape.
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
