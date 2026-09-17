/**
 * `scheduling` module public entry point — the pure domain surface only,
 * mirroring `catalog/index.ts`'s convention.
 *
 * PR-03 is domain-only: this module has no application, infrastructure or HTTP
 * layer, no NestJS module, no persistence and no Booking awareness. PR-04 adds
 * `scheduling/{infrastructure,http}` behind this same entry point; a sibling
 * module must never reach past it into internals (`no-cross-module-internals`).
 */

export {
  compareIntervals,
  createInterval,
  intervalContains,
  intervalsAreAdjacent,
  intervalsOverlap,
  type Interval,
} from "./domain/interval.js";

export {
  intersectIntervals,
  normalizeIntervals,
  subtractIntervals,
  unionIntervals,
} from "./domain/interval-set.js";

export {
  MAX_EXPANSION_HORIZON_DAYS,
  MINUTES_PER_DAY,
  createWeeklyAvailabilityPattern,
  expandWeeklyAvailability,
  type ExpansionRange,
  type IsoDayOfWeek,
  type WeeklyAvailabilityPattern,
  type WeeklyAvailabilityPatternInput,
  type WeeklyAvailabilityRule,
} from "./domain/recurrence.js";

export {
  ExpansionHorizonExceededError,
  InvalidEffectiveRangeError,
  InvalidExpansionRangeError,
  InvalidIntervalBoundsError,
  InvalidLocalTimeRangeError,
  InvalidTimeZoneError,
  InvalidWeeklyAvailabilityRuleError,
} from "./domain/scheduling-errors.js";
