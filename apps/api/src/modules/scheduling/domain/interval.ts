/**
 * The Scheduling interval value (FR-010, FR-013, ADR-010).
 *
 * An `Interval` is an immutable **half-open** `[start, end)` span of absolute
 * instants with `start < end`. Half-open is the single interval semantics used
 * across Slotnova: two intervals that merely touch (`a.end === b.start`) do not
 * overlap, which is what lets back-to-back bookings exist (spec.md "Edge Cases",
 * SC-002) and what PostgreSQL's `tstzrange`/`EXCLUDE` constraint will enforce in
 * PR-06 (ADR-011).
 *
 * Instants are `Temporal.Instant` — never JavaScript `Date` (ADR-010, AGENTS.md
 * hard prohibition). This file deliberately contains no persistence, no tenant
 * concept and no resource/staff/location dimension.
 */

import { Temporal } from "@js-temporal/polyfill";

import { InvalidIntervalBoundsError } from "./scheduling-errors.js";

export interface Interval {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

/** Build a half-open interval. Throws unless `start < end` (empty spans are not values). */
export function createInterval(start: Temporal.Instant, end: Temporal.Instant): Interval {
  if (Temporal.Instant.compare(start, end) >= 0) {
    throw new InvalidIntervalBoundsError(start.toString(), end.toString());
  }
  return Object.freeze({ start, end });
}

/**
 * True when the two intervals share at least one instant. Touching endpoints are
 * **not** an overlap — that is the half-open rule (SC-002).
 */
export function intervalsOverlap(left: Interval, right: Interval): boolean {
  return (
    Temporal.Instant.compare(left.start, right.end) < 0 &&
    Temporal.Instant.compare(right.start, left.end) < 0
  );
}

/** True when the intervals touch exactly (`a.end === b.start` in either order). */
export function intervalsAreAdjacent(left: Interval, right: Interval): boolean {
  return left.end.equals(right.start) || right.end.equals(left.start);
}

/** Membership under half-open semantics: `start` is included, `end` is excluded. */
export function intervalContains(interval: Interval, instant: Temporal.Instant): boolean {
  return (
    Temporal.Instant.compare(interval.start, instant) <= 0 &&
    Temporal.Instant.compare(instant, interval.end) < 0
  );
}

/** Total order used by normalisation: by `start`, then by `end`. */
export function compareIntervals(left: Interval, right: Interval): number {
  const byStart = Temporal.Instant.compare(left.start, right.start);
  return byStart !== 0 ? byStart : Temporal.Instant.compare(left.end, right.end);
}
