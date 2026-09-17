/**
 * Runtime request/response schemas for `/v1/scheduling/*`
 * (`specs/002-catalog-scheduling-booking/contracts/scheduling.contract.md`,
 * PR-04, issue #66).
 *
 * These Zod schemas are the single boundary source: `createZodDto()` makes
 * each one both the runtime validator (via `apps/api/src/http/validation/
 * zod-validation.ts`'s `ZodValidationPipe`) and the OpenAPI schema
 * `@ApiBody`/`@ZodResponse` publish — which is what `packages/contracts` then
 * generates from. No hand-written DTO/interface duplicates any shape here.
 *
 * ## Strict request objects
 *
 * Every *request* schema is `.strict()`: an unexpected property is rejected
 * rather than silently dropped, so a client sending `resourceId`,
 * `locationId` or `staffId` — none of which exist in Phase 2 (Founder
 * decisions 3 & 4) — gets a clear 400 instead of having it quietly ignored.
 *
 * ## Which failures are 400 and which are 422
 *
 * Shape/type failures (missing field, wrong JSON type, unknown property, a
 * date that is not `YYYY-MM-DD`, an instant without an offset) are the
 * existing `validation` problem at its catalogue default of 400 — unchanged
 * from every Phase-1/PR-02 endpoint. Domain-invariant failures (an
 * unrecognised IANA zone, weekly rules that overlap within a day, an inverted
 * effective window, `startsAt >= endsAt`, a range beyond the 370-day
 * expansion horizon) are raised by the merged PR-03 Scheduling domain and
 * mapped to the same `validation` problem at 422 by
 * `scheduling-problem.filter.ts`, which is what the contract specifies. The
 * invariants themselves are therefore asserted exactly once, in
 * `scheduling/domain`, and are NOT re-encoded here.
 *
 * ## Time strings
 *
 * Parsing is done with `Temporal` (ADR-010) — never `new Date(...)`, and
 * never a hand-rolled regex that would accept `2026-02-30`. An instant must
 * carry an explicit UTC offset (`Temporal.Instant.from` rejects a bare local
 * wall time), which is what "always resolved instants" in the contract means.
 */
import { Temporal } from "@js-temporal/polyfill";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { MINUTES_PER_DAY } from "../domain/recurrence.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** A calendar date, `YYYY-MM-DD`, that really exists (`2026-02-30` is rejected). */
const localDateSchema = z
  .string()
  .regex(ISO_DATE, "must be a YYYY-MM-DD date")
  .refine(
    (value) => {
      try {
        Temporal.PlainDate.from(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "must be a valid calendar date" },
  );

/** An absolute instant with an explicit UTC offset, e.g. `2026-09-01T09:00:00Z`. */
const instantSchema = z.string().refine(
  (value) => {
    try {
      Temporal.Instant.from(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be an ISO-8601 instant with an explicit UTC offset" },
);

/**
 * One weekly rule: an ISO day (Monday = 1) plus a half-open local wall-time
 * span in minutes from local midnight. The bounds below are the structural
 * envelope only — that `end > start`, that two rules do not overlap within a
 * day, and that the timezone is a real IANA identifier are the PR-03 domain's
 * invariants (422), deliberately not duplicated here.
 */
export const weeklyAvailabilityRuleSchema = z
  .object({
    /**
     * Declared as the seven literals rather than `int().min(1).max(7)` so the
     * parsed type is exactly the domain's `IsoDayOfWeek` union — the boundary
     * narrows the value once, instead of the controller casting a plain
     * `number` on its way into the domain. It also publishes a real enum in
     * the OpenAPI document.
     */
    dayOfWeek: z.literal([1, 2, 3, 4, 5, 6, 7]),
    startMinuteOfDay: z
      .number()
      .int()
      .min(0)
      .max(MINUTES_PER_DAY - 1),
    endMinuteOfDay: z.number().int().min(1).max(MINUTES_PER_DAY),
  })
  .strict();

export const availabilityPatternResponseSchema = z.object({
  id: z.string(),
  /** IANA identifier, e.g. `Europe/London`. */
  timezone: z.string(),
  weeklyRule: z.array(weeklyAvailabilityRuleSchema),
  /** Inclusive lower bound of the effective window; `null` = unbounded. */
  effectiveFrom: z.string().nullable(),
  /** EXCLUSIVE upper bound: `2026-10-01` yields no availability on 2026-10-01. */
  effectiveUntil: z.string().nullable(),
});
export class AvailabilityPatternResponseDto extends createZodDto(
  availabilityPatternResponseSchema,
) {}
export type AvailabilityPatternResponseBody = z.infer<typeof availabilityPatternResponseSchema>;

/**
 * A list, per the contract — "in practice at most the workspace's single
 * active pattern set, but returned as a list to allow effective-dated pattern
 * history without a breaking shape change". No cursor: a workspace holds a
 * handful of history rows at most, and inventing pagination would be API
 * surface this PR was not asked to add.
 */
export const availabilityPatternListResponseSchema = z.object({
  items: z.array(availabilityPatternResponseSchema),
});
export class AvailabilityPatternListResponseDto extends createZodDto(
  availabilityPatternListResponseSchema,
) {}
export type AvailabilityPatternListResponseBody = z.infer<
  typeof availabilityPatternListResponseSchema
>;

/** `{ timezone, weeklyRule, effectiveFrom?, effectiveUntil? }` and nothing else. */
export const createAvailabilityPatternRequestSchema = z
  .object({
    timezone: z.string().min(1).max(100),
    weeklyRule: z.array(weeklyAvailabilityRuleSchema),
    effectiveFrom: localDateSchema.optional(),
    effectiveUntil: localDateSchema.optional(),
  })
  .strict();
export class CreateAvailabilityPatternRequestDto extends createZodDto(
  createAvailabilityPatternRequestSchema,
) {}
export type CreateAvailabilityPatternRequestBody = z.infer<
  typeof createAvailabilityPatternRequestSchema
>;

export const availabilityExceptionResponseSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  reason: z.string().nullable(),
});
export class AvailabilityExceptionResponseDto extends createZodDto(
  availabilityExceptionResponseSchema,
) {}
export type AvailabilityExceptionResponseBody = z.infer<typeof availabilityExceptionResponseSchema>;

/**
 * `{ startsAt, endsAt, reason? }` — always resolved instants, never a
 * recurring rule (FR-012). There is deliberately no `rrule`/`recurrence`/
 * `frequency` field.
 */
export const createAvailabilityExceptionRequestSchema = z
  .object({
    startsAt: instantSchema,
    endsAt: instantSchema,
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();
export class CreateAvailabilityExceptionRequestDto extends createZodDto(
  createAvailabilityExceptionRequestSchema,
) {}
export type CreateAvailabilityExceptionRequestBody = z.infer<
  typeof createAvailabilityExceptionRequestSchema
>;

/**
 * `{ from, to }` — a half-open local-date window `[from, to)`. Bounded by the
 * documented expansion horizon (`MAX_EXPANSION_HORIZON_DAYS = 370`), which
 * the PR-03 domain enforces as a 422; the width is not re-checked here
 * because a single implementation of that rule is the point.
 */
export const resolveAvailabilityRequestSchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
  })
  .strict();
export class ResolveAvailabilityRequestDto extends createZodDto(resolveAvailabilityRequestSchema) {}
export type ResolveAvailabilityRequestBody = z.infer<typeof resolveAvailabilityRequestSchema>;

/** Half-open `[start, end)` UTC instants. */
export const resolvedIntervalSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const resolveAvailabilityResponseSchema = z.object({
  intervals: z.array(resolvedIntervalSchema),
});
export class ResolveAvailabilityResponseDto extends createZodDto(
  resolveAvailabilityResponseSchema,
) {}
export type ResolveAvailabilityResponseBody = z.infer<typeof resolveAvailabilityResponseSchema>;
