/**
 * Runtime request/response schemas for `/v1/catalog/*`
 * (`specs/002-catalog-scheduling-booking/contracts/catalog.contract.md`,
 * PR-02, issue #60).
 *
 * These Zod schemas are the single boundary source: `createZodDto()` makes
 * each one both the runtime validator (via
 * `apps/api/src/http/validation/zod-validation.ts`'s `ZodValidationPipe`)
 * and the OpenAPI schema `@ApiBody`/`@ZodResponse` publish — which is what
 * `packages/contracts` then generates from. No hand-written DTO/interface
 * duplicates any shape here, and nothing in `apps/web` re-declares them.
 *
 * ## Strict request objects
 *
 * Every *request* schema is `.strict()`: an unexpected property is rejected
 * rather than silently dropped. This matters beyond tidiness for
 * `POST /catalog/services`, whose idempotency fingerprint is computed from
 * the parsed payload — a stripped unknown field would make two materially
 * different requests fingerprint identically and silently replay one
 * another's result. Rejecting is the only behavior that keeps "same key +
 * materially different request -> conflict" honest.
 *
 * ## Which failures are 400 and which are 422
 *
 * Shape/type failures (missing field, wrong JSON type, unknown property,
 * malformed uuid) are the existing `validation` problem at its catalogue
 * default of 400 — unchanged from every Phase-1 endpoint. Domain-invariant
 * failures (`durationMinutes < 1`, negative price, unsupported currency,
 * blank name, a category that is not in this workspace) are raised by the
 * PR-01 Catalog domain/use cases and mapped to the same `validation`
 * problem at 422, which is what `catalog.contract.md` specifies for
 * "duration/price invariants". The invariants themselves are therefore
 * asserted exactly once, in `catalog/domain`, and are NOT re-encoded here.
 */
import { createZodDto } from "../../../http/openapi/zod-dto.js";
import { z } from "zod";

/** Bounded so an absurd page size cannot be requested; 50 matches nothing pre-existing because no other list endpoint exists yet. */
export const SERVICE_LIST_MAX_LIMIT = 100;
export const SERVICE_LIST_DEFAULT_LIMIT = 50;

const serviceNameSchema = z.string().min(1).max(200);
const minutesSchema = z.number().int();
const priceAmountMinorSchema = z.number().int();
const priceCurrencySchema = z.string().min(3).max(3);

export const serviceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryId: z.string().nullable(),
  durationMinutes: z.number(),
  preBufferMinutes: z.number(),
  postBufferMinutes: z.number(),
  /** ADR-015 integer minor units — never a decimal/float money value. */
  priceAmountMinor: z.number(),
  priceCurrency: z.string(),
  active: z.boolean(),
});
export class ServiceResponseDto extends createZodDto(serviceResponseSchema) {}
export type ServiceResponseBody = z.infer<typeof serviceResponseSchema>;

export const serviceListResponseSchema = z.object({
  items: z.array(serviceResponseSchema),
  /**
   * The cursor to pass as `?cursor=` for the next page, or `null` when this
   * page is the last one. Keyset, not an offset (see
   * `ServicesRepository.list`).
   */
  nextCursor: z.string().nullable(),
});
export class ServiceListResponseDto extends createZodDto(serviceListResponseSchema) {}
export type ServiceListResponseBody = z.infer<typeof serviceListResponseSchema>;

/**
 * `active` arrives as the literal string `"true"`/`"false"` because query
 * strings have no booleans; it is normalized here so nothing downstream
 * parses strings. Absent means "no filter" — explicitly not "active only".
 */
export const listServicesQuerySchema = z
  .object({
    active: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(SERVICE_LIST_MAX_LIMIT)
      .default(SERVICE_LIST_DEFAULT_LIMIT),
  })
  .strict();
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

export const createServiceRequestSchema = z
  .object({
    name: serviceNameSchema,
    categoryId: z.uuid().optional(),
    durationMinutes: minutesSchema,
    preBufferMinutes: minutesSchema.optional(),
    postBufferMinutes: minutesSchema.optional(),
    priceAmountMinor: priceAmountMinorSchema,
    priceCurrency: priceCurrencySchema,
  })
  .strict();
export class CreateServiceRequestDto extends createZodDto(createServiceRequestSchema) {}
export type CreateServiceRequestBody = z.infer<typeof createServiceRequestSchema>;

/**
 * Only the approved mutable fields (`catalog.contract.md`: "partial
 * `Service` fields, `active` toggle included"). `id`/`workspaceId` are
 * absent by construction and `.strict()` rejects them rather than ignoring
 * them. `categoryId: null` clears the association; omitting it leaves it
 * unchanged — a distinction `.optional().nullable()` expresses exactly.
 *
 * There is no version/ETag field: `catalog.contract.md` records
 * last-write-wins as a deliberate, documented exception for Service edits,
 * so no optimistic-concurrency machinery is introduced here.
 */
export const updateServiceRequestSchema = z
  .object({
    name: serviceNameSchema.optional(),
    categoryId: z.uuid().nullable().optional(),
    durationMinutes: minutesSchema.optional(),
    preBufferMinutes: minutesSchema.optional(),
    postBufferMinutes: minutesSchema.optional(),
    priceAmountMinor: priceAmountMinorSchema.optional(),
    priceCurrency: priceCurrencySchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => (value.priceAmountMinor === undefined) === (value.priceCurrency === undefined),
    {
      // Price is one value in two columns (ADR-015). Accepting half of it
      // would silently combine a new amount with an old currency.
      message: "priceAmountMinor and priceCurrency must be supplied together",
      path: ["priceAmountMinor"],
    },
  );
export class UpdateServiceRequestDto extends createZodDto(updateServiceRequestSchema) {}
export type UpdateServiceRequestBody = z.infer<typeof updateServiceRequestSchema>;

export const serviceIdParamSchema = z.uuid();

export const serviceCategoryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number(),
});
export class ServiceCategoryResponseDto extends createZodDto(serviceCategoryResponseSchema) {}
export type ServiceCategoryResponseBody = z.infer<typeof serviceCategoryResponseSchema>;

export const serviceCategoryListResponseSchema = z.object({
  items: z.array(serviceCategoryResponseSchema),
});
export class ServiceCategoryListResponseDto extends createZodDto(
  serviceCategoryListResponseSchema,
) {}
export type ServiceCategoryListResponseBody = z.infer<typeof serviceCategoryListResponseSchema>;

/** `{ name, sortOrder? }` and nothing else — no nesting/description/icon (Founder-finalized R-CAT). */
export const createServiceCategoryRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export class CreateServiceCategoryRequestDto extends createZodDto(
  createServiceCategoryRequestSchema,
) {}
export type CreateServiceCategoryRequestBody = z.infer<typeof createServiceCategoryRequestSchema>;
