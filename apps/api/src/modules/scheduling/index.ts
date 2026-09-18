/**
 * `scheduling` module public entry point — the pure domain surface plus the
 * ONE application port a sibling module consumes, mirroring
 * `catalog/index.ts`'s convention.
 *
 * PR-04 added `scheduling/{application,infrastructure,http}` behind this
 * entry point and deliberately exported none of it, because no sibling
 * module needed a Scheduling concept yet. PR-09 (issue #81) is that real
 * consumer: Calendar's read composition. Exactly ONE application symbol is
 * published for it — {@link AvailabilityReadPort}, the narrow read seam —
 * and no repository, no other use case and no schema is reachable from
 * here. Widen this file only when another real consumer appears; never
 * import `scheduling/infrastructure/**` directly from another module
 * (enforced by `no-cross-module-internals`).
 */

export {
  SCHEDULING_CAPABILITIES,
  SCHEDULING_MANAGE,
  SCHEDULING_READ,
  type SchedulingCapability,
} from "./domain/policy/capabilities.js";

export {
  AvailabilityReadPort,
  type AvailabilityReadRange,
} from "./application/availability-read.port.js";

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
