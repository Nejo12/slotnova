/**
 * `scheduling` module public entry point — the pure domain surface only,
 * mirroring `catalog/index.ts`'s convention.
 *
 * PR-04 added `scheduling/{application,infrastructure,http}` and
 * `SchedulingModule` behind this entry point, but deliberately exported none
 * of it: no sibling module needs a Scheduling concept yet (Calendar's
 * read-composition endpoint is PR-09), and a repository or use case exported
 * "just in case" would be exactly the cross-domain shortcut constitution III
 * forbids. Widen this file when a real consumer appears; never import
 * `scheduling/infrastructure/**` or `scheduling/application/**` directly from
 * another module (enforced by `no-cross-module-internals`).
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
  assertValidExpansionRange,
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
