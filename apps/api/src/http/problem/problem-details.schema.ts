/**
 * The single OpenAPI/Zod source for the `application/problem+json` response
 * shape (RFC 9457, `contracts/problem+json.contract.md`), added to close a
 * review-identified gap (PR-15, tasks T064-T067): the generated OpenAPI
 * document documented success responses only, so `packages/contracts` had no
 * representation of error responses, breaking-change detection could not
 * protect them, and T067's contract tests validated only the hand-written
 * `expectProblemJson` helper rather than the generated contract.
 *
 * `createZodDto()`-wrapped, same pattern as every other HTTP boundary schema
 * since T064 (`me.schema.ts`/`session.schema.ts`/etc.,
 * `docs/decisions/0004-validation-contract-integration.md`) -- this is the
 * ONE place every controller's `@ApiResponse` error decorator references via
 * `getSchemaPath(ProblemDetailsDto)`; no controller re-declares these fields.
 *
 * Kept in lockstep with the existing `ProblemDetails` TypeScript interface
 * (`./problem-types.ts`, unmodified in its own runtime behavior) by having
 * `ProblemDetails` become `z.infer<typeof problemDetailsSchema>` -- a single
 * source, not two hand-synced representations. `problem-types.ts` was not
 * itself migrated to `createZodDto` (as `me.schema.ts` etc. were) because it
 * is not an HTTP request/response boundary schema in the `nestjs-zod` sense
 * -- it is the shape `problem.filter.ts` builds directly. Checked before
 * making this change: `ProblemDetails` is used only as a type annotation in
 * `problem.filter.ts` (`toProblemDetails`'s return type) and `csrf.ts` (the
 * Fastify-hook CSRF-rejection body literal) -- both are structurally-typed
 * plain-object-literal call sites, so swapping the interface for a
 * `z.infer<>` type alias changes nothing about what those two files compile
 * or emit. `problem.filter.ts` itself is NOT touched by this change -- this
 * task adds OpenAPI *documentation* of the existing response shape, it does
 * not change what the filter actually sends.
 *
 * **`requestId` -- deliberately absent as its own field.** The review that
 * prompted this file initially asked for a `requestId` field "where
 * applicable." Verified directly against `problem-types.ts` and
 * `problem.filter.ts`: there is no separate `requestId` member in the actual
 * response body. `requestId` exists only as internal, server-side log
 * metadata (`problem.filter.ts`'s `logger.error(..., { meta: { requestId,
 * ... } })`) and is embedded in the `instance` field as a URL via
 * `requestInstanceUrl(requestId)` (e.g. `https://slotnova.app/requests/<uuid>`)
 * -- never exposed as its own top-level key. Adding a `requestId` field here
 * would document a field the API does not actually return, which is exactly
 * what this task's own no-duplication/no-invention instruction forbids. A
 * caller that wants the correlation id parses it out of `instance`.
 */
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const problemValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(problemValidationErrorSchema).readonly().optional(),
  requiredCapability: z.string().optional(),
  checks: z.record(z.string(), z.string()).optional(),
});

/**
 * The DTO class every controller's error `@ApiResponse` decorator references
 * via `getSchemaPath(ProblemDetailsDto)` -- registered once as an OpenAPI
 * `extraModels` entry (`../../scripts/generate-openapi.ts`) so its schema
 * appears in `components.schemas` even though no *success* response ever
 * uses it as a `type:`.
 */
export class ProblemDetailsDto extends createZodDto(problemDetailsSchema) {}
