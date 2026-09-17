/**
 * Scheduling domain errors.
 *
 * These are pure domain failures: they carry no HTTP status, no `problem+json`
 * slug and no transport vocabulary of any kind. Translating them at the API
 * boundary belongs to the Scheduling HTTP layer (PR-04), exactly as Catalog's
 * domain errors are translated by `catalog/http/catalog-problem.filter.ts`.
 */

export class InvalidIntervalBoundsError extends Error {
  override readonly name = "InvalidIntervalBoundsError";

  constructor(
    readonly start: string,
    readonly end: string,
  ) {
    super(`interval must be half-open [start,end) with start < end, got [${start}, ${end})`);
  }
}

export class InvalidTimeZoneError extends Error {
  override readonly name = "InvalidTimeZoneError";

  constructor(readonly value: string) {
    super(`"${value}" is not a recognised IANA time zone identifier`);
  }
}

export class InvalidLocalTimeRangeError extends Error {
  override readonly name = "InvalidLocalTimeRangeError";

  constructor(
    readonly startMinuteOfDay: number,
    readonly endMinuteOfDay: number,
    readonly reason: string,
  ) {
    super(
      `invalid local time range [${startMinuteOfDay}, ${endMinuteOfDay}) minutes of day: ${reason}`,
    );
  }
}

export class InvalidWeeklyAvailabilityRuleError extends Error {
  override readonly name = "InvalidWeeklyAvailabilityRuleError";

  constructor(readonly reason: string) {
    super(`invalid weekly availability rule: ${reason}`);
  }
}

export class InvalidEffectiveRangeError extends Error {
  override readonly name = "InvalidEffectiveRangeError";

  constructor(
    readonly effectiveFrom: string,
    readonly effectiveUntil: string,
  ) {
    super(
      `effective window must be half-open [from,until) with from < until, got [${effectiveFrom}, ${effectiveUntil})`,
    );
  }
}

export class InvalidExpansionRangeError extends Error {
  override readonly name = "InvalidExpansionRangeError";

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`expansion range must be half-open [from,to) with from < to, got [${from}, ${to})`);
  }
}

export class ExpansionHorizonExceededError extends Error {
  override readonly name = "ExpansionHorizonExceededError";

  constructor(
    readonly requestedDays: number,
    readonly maximumDays: number,
  ) {
    super(
      `requested expansion of ${requestedDays} day(s) exceeds the maximum horizon of ${maximumDays} day(s)`,
    );
  }
}
