/**
 * Weekly recurring availability (FR-011, FR-014, FR-015, ADR-010).
 *
 * The recurrence model is deliberately the narrow one the merged Phase-2
 * planning approved — `data-model.md` "AvailabilityPattern": an IANA timezone
 * plus a `weekly_rule` of "day-of-week → local `[start,end)` wall-time
 * intervals", with optional effective bounds. It is **not** an RFC-5545 engine:
 * no `RRULE`, no monthly/yearly frequency, no `BYSETPOS`, no exception dates.
 * Nothing here knows about workspaces, ids, staff, resources or locations
 * (Founder decisions 3 & 4) — those live in PR-04's persistence layer.
 *
 * Local times are minutes from local midnight, `0 <= start < end <= 1440`.
 * A rule therefore never crosses a local-date boundary: the merged planning
 * authorises only per-day wall-time intervals (and
 * `contracts/scheduling.contract.md` rejects intervals that overlap *within a
 * day*), so cross-midnight recurrence is not invented here. `end === 1440` means
 * local midnight ending that day, which is the half-open closure of the day, not
 * a span into the next one.
 */

import { Temporal } from "@js-temporal/polyfill";

import { createInterval, type Interval } from "./interval.js";
import { normalizeIntervals } from "./interval-set.js";
import {
  ExpansionHorizonExceededError,
  InvalidEffectiveRangeError,
  InvalidExpansionRangeError,
  InvalidLocalTimeRangeError,
  InvalidWeeklyAvailabilityRuleError,
} from "./scheduling-errors.js";
import { assertValidIanaTimeZone, resolveLocalDateTime } from "./wall-clock.js";

/** ISO-8601 day of week, as `Temporal.PlainDate#dayOfWeek` reports it (Monday = 1). */
export type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const MINUTES_PER_DAY = 1440;

/**
 * Maximum number of local days a single expansion may cover (FR-015).
 *
 * 370 days = one full calendar year (366 in a leap year) plus a few days of
 * overhang, so a caller can always request "the next year of availability" in
 * one bounded call — and every zone's two annual DST transitions are inside any
 * window that large. It is a hard ceiling, not a default: callers always pass an
 * explicit range, and there is deliberately no unbounded/infinite expansion API.
 */
export const MAX_EXPANSION_HORIZON_DAYS = 370;

export interface WeeklyAvailabilityRule {
  readonly dayOfWeek: IsoDayOfWeek;
  /** Inclusive local start, minutes from local midnight, `0..1439`. */
  readonly startMinuteOfDay: number;
  /** Exclusive local end, minutes from local midnight, `1..1440`. */
  readonly endMinuteOfDay: number;
}

export interface WeeklyAvailabilityPatternInput {
  /** IANA identifier, e.g. `Europe/London`. A fixed UTC offset is rejected. */
  readonly timeZone: string;
  readonly rules: readonly WeeklyAvailabilityRule[];
  /** Inclusive local date the recurrence starts applying, if bounded. */
  readonly effectiveFrom?: Temporal.PlainDate | undefined;
  /** Exclusive local date the recurrence stops applying, if bounded. */
  readonly effectiveUntil?: Temporal.PlainDate | undefined;
}

export interface WeeklyAvailabilityPattern {
  readonly timeZone: string;
  readonly rules: readonly WeeklyAvailabilityRule[];
  readonly effectiveFrom: Temporal.PlainDate | undefined;
  readonly effectiveUntil: Temporal.PlainDate | undefined;
}

/** Half-open local-date window `[from, to)` an expansion is asked to cover. */
export interface ExpansionRange {
  readonly from: Temporal.PlainDate;
  readonly to: Temporal.PlainDate;
}

function assertValidLocalTimeRange(rule: WeeklyAvailabilityRule): void {
  const { startMinuteOfDay, endMinuteOfDay } = rule;
  const fail = (reason: string): never => {
    throw new InvalidLocalTimeRangeError(startMinuteOfDay, endMinuteOfDay, reason);
  };

  if (!Number.isInteger(startMinuteOfDay) || !Number.isInteger(endMinuteOfDay)) {
    fail("both bounds must be whole minutes");
  }
  if (startMinuteOfDay < 0 || startMinuteOfDay >= MINUTES_PER_DAY) {
    fail(`start must be within [0, ${MINUTES_PER_DAY})`);
  }
  if (endMinuteOfDay < 1 || endMinuteOfDay > MINUTES_PER_DAY) {
    fail(`end must be within (0, ${MINUTES_PER_DAY}]`);
  }
  if (endMinuteOfDay <= startMinuteOfDay) {
    fail("end must be strictly after start (a rule never crosses local midnight)");
  }
}

function assertNoOverlapWithinDay(rules: readonly WeeklyAvailabilityRule[]): void {
  const byDay = new Map<IsoDayOfWeek, WeeklyAvailabilityRule[]>();
  for (const rule of rules) {
    const sameDay = byDay.get(rule.dayOfWeek) ?? [];
    sameDay.push(rule);
    byDay.set(rule.dayOfWeek, sameDay);
  }

  for (const [dayOfWeek, sameDay] of byDay) {
    const sorted = [...sameDay].sort((a, b) => a.startMinuteOfDay - b.startMinuteOfDay);
    for (let index = 1; index < sorted.length; index += 1) {
      // Half-open: touching (`previous.end === next.start`) is allowed.
      if (sorted[index]!.startMinuteOfDay < sorted[index - 1]!.endMinuteOfDay) {
        throw new InvalidWeeklyAvailabilityRuleError(`two rules overlap on ISO day ${dayOfWeek}`);
      }
    }
  }
}

export function createWeeklyAvailabilityPattern(
  input: WeeklyAvailabilityPatternInput,
): WeeklyAvailabilityPattern {
  assertValidIanaTimeZone(input.timeZone);

  for (const rule of input.rules) {
    if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 1 || rule.dayOfWeek > 7) {
      throw new InvalidWeeklyAvailabilityRuleError(
        `day of week must be an ISO day 1..7, got ${rule.dayOfWeek}`,
      );
    }
    assertValidLocalTimeRange(rule);
  }
  assertNoOverlapWithinDay(input.rules);

  const { effectiveFrom, effectiveUntil } = input;
  if (
    effectiveFrom !== undefined &&
    effectiveUntil !== undefined &&
    Temporal.PlainDate.compare(effectiveFrom, effectiveUntil) >= 0
  ) {
    throw new InvalidEffectiveRangeError(effectiveFrom.toString(), effectiveUntil.toString());
  }

  return Object.freeze({
    timeZone: input.timeZone,
    rules: Object.freeze([...input.rules].map((rule) => Object.freeze({ ...rule }))),
    effectiveFrom,
    effectiveUntil,
  });
}

function laterDate(left: Temporal.PlainDate, right: Temporal.PlainDate): Temporal.PlainDate {
  return Temporal.PlainDate.compare(left, right) >= 0 ? left : right;
}

function earlierDate(left: Temporal.PlainDate, right: Temporal.PlainDate): Temporal.PlainDate {
  return Temporal.PlainDate.compare(left, right) <= 0 ? left : right;
}

function localMidnight(date: Temporal.PlainDate): Temporal.PlainDateTime {
  return date.toPlainDateTime(Temporal.PlainTime.from({ hour: 0 }));
}

/**
 * Expand a weekly pattern into absolute half-open intervals over an explicit,
 * bounded local-date range `[from, to)` (FR-015 — there is no unbounded
 * expansion API).
 *
 * The output is normalised: sorted, non-overlapping, and with continuous spans
 * coalesced. Occurrences that fall entirely inside a DST forward gap produce no
 * interval at all.
 */
export function expandWeeklyAvailability(
  pattern: WeeklyAvailabilityPattern,
  range: ExpansionRange,
): readonly Interval[] {
  if (Temporal.PlainDate.compare(range.from, range.to) >= 0) {
    throw new InvalidExpansionRangeError(range.from.toString(), range.to.toString());
  }

  const requestedDays = range.from.until(range.to, { largestUnit: "day" }).days;
  if (requestedDays > MAX_EXPANSION_HORIZON_DAYS) {
    throw new ExpansionHorizonExceededError(requestedDays, MAX_EXPANSION_HORIZON_DAYS);
  }

  if (pattern.rules.length === 0) return [];

  const start =
    pattern.effectiveFrom === undefined ? range.from : laterDate(range.from, pattern.effectiveFrom);
  const end =
    pattern.effectiveUntil === undefined ? range.to : earlierDate(range.to, pattern.effectiveUntil);
  if (Temporal.PlainDate.compare(start, end) >= 0) return [];

  const rulesByDay = new Map<number, WeeklyAvailabilityRule[]>();
  for (const rule of pattern.rules) {
    const sameDay = rulesByDay.get(rule.dayOfWeek) ?? [];
    sameDay.push(rule);
    rulesByDay.set(rule.dayOfWeek, sameDay);
  }

  const expanded: Interval[] = [];
  for (let date = start; Temporal.PlainDate.compare(date, end) < 0; date = date.add({ days: 1 })) {
    const midnight = localMidnight(date);
    for (const rule of rulesByDay.get(date.dayOfWeek) ?? []) {
      const startInstant = resolveLocalDateTime(
        midnight.add({ minutes: rule.startMinuteOfDay }),
        pattern.timeZone,
      );
      const endInstant = resolveLocalDateTime(
        midnight.add({ minutes: rule.endMinuteOfDay }),
        pattern.timeZone,
      );

      // Empty (or inverted) after DST resolution means the declared wall-clock
      // span contains no real instant — the missing hour is skipped, not shifted.
      if (Temporal.Instant.compare(startInstant, endInstant) >= 0) continue;
      expanded.push(createInterval(startInstant, endInstant));
    }
  }

  return normalizeIntervals(expanded);
}
