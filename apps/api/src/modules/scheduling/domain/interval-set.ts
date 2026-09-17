/**
 * Pure interval-set algebra over half-open `[start, end)` intervals (FR-013).
 *
 * Every function here is total, deterministic, side-effect free and independent
 * of persistence, tenancy and the host clock/timezone. Availability is modelled
 * as a *set of instants*; the interval list is just its canonical encoding.
 *
 * ## Canonical (normalised) form
 *
 * A normalised set is sorted by `start`, contains no empty interval, and no two
 * of its intervals overlap **or touch**. Touching intervals are coalesced
 * because `[09:00,12:00) ∪ [12:00,17:00)` covers exactly the same instants as
 * `[09:00,17:00)` — continuous availability — so coalescing yields a unique
 * representation without changing coverage
 * (`docs/testing/property-testing-conventions.md`: "normalising a set of
 * intervals produces disjoint, sorted, coalesced intervals covering exactly the
 * same instants").
 *
 * Coalescing is a property of *set normalisation only*. It does not soften the
 * half-open overlap rule: `intervalsOverlap` still reports `a.end === b.start`
 * as non-overlapping (SC-002), which is what booking-conflict detection uses.
 */

import { Temporal } from "@js-temporal/polyfill";

import { compareIntervals, createInterval, type Interval } from "./interval.js";

function minInstant(left: Temporal.Instant, right: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(left, right) <= 0 ? left : right;
}

function maxInstant(left: Temporal.Instant, right: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(left, right) >= 0 ? left : right;
}

/**
 * Sort, merge and coalesce an arbitrary (possibly unsorted, overlapping,
 * touching) set of intervals into canonical form. Idempotent; never mutates the
 * input.
 */
export function normalizeIntervals(intervals: readonly Interval[]): readonly Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort(compareIntervals);
  const normalised: Interval[] = [];
  let currentStart = sorted[0]!.start;
  let currentEnd = sorted[0]!.end;

  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!;
    if (Temporal.Instant.compare(next.start, currentEnd) <= 0) {
      // Overlapping or exactly touching: one continuous span.
      currentEnd = maxInstant(currentEnd, next.end);
      continue;
    }
    normalised.push(createInterval(currentStart, currentEnd));
    currentStart = next.start;
    currentEnd = next.end;
  }
  normalised.push(createInterval(currentStart, currentEnd));

  return Object.freeze(normalised);
}

/** Union (merge) of two sets, in canonical form. */
export function unionIntervals(
  left: readonly Interval[],
  right: readonly Interval[],
): readonly Interval[] {
  return normalizeIntervals([...left, ...right]);
}

/**
 * Intersection: the instants covered by **both** sets, in canonical form.
 * Touching intervals intersect to nothing (half-open).
 */
export function intersectIntervals(
  left: readonly Interval[],
  right: readonly Interval[],
): readonly Interval[] {
  const leftSet = normalizeIntervals(left);
  const rightSet = normalizeIntervals(right);
  const result: Interval[] = [];

  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftSet.length && rightIndex < rightSet.length) {
    const a = leftSet[leftIndex]!;
    const b = rightSet[rightIndex]!;
    const start = maxInstant(a.start, b.start);
    const end = minInstant(a.end, b.end);

    if (Temporal.Instant.compare(start, end) < 0) result.push(createInterval(start, end));

    // Advance whichever interval ends first; on a tie either may advance.
    if (Temporal.Instant.compare(a.end, b.end) <= 0) leftIndex += 1;
    else rightIndex += 1;
  }

  return Object.freeze(result);
}

/**
 * Difference `source - removed`: the instants covered by `source` and not by
 * `removed`, in canonical form. Used by FR-012 (a time-off exception always wins
 * over the recurring pattern for its overlapping span).
 */
export function subtractIntervals(
  source: readonly Interval[],
  removed: readonly Interval[],
): readonly Interval[] {
  const sourceSet = normalizeIntervals(source);
  if (sourceSet.length === 0) return [];

  const removedSet = normalizeIntervals(removed);
  if (removedSet.length === 0) return sourceSet;

  const result: Interval[] = [];
  let removedIndex = 0;

  for (const interval of sourceSet) {
    let cursor = interval.start;

    // Skip blockers that end at or before this interval starts (touching a
    // blocker removes no time).
    while (
      removedIndex < removedSet.length &&
      Temporal.Instant.compare(removedSet[removedIndex]!.end, cursor) <= 0
    ) {
      removedIndex += 1;
    }

    let scanIndex = removedIndex;
    while (
      scanIndex < removedSet.length &&
      Temporal.Instant.compare(removedSet[scanIndex]!.start, interval.end) < 0
    ) {
      const blocker = removedSet[scanIndex]!;
      if (Temporal.Instant.compare(cursor, blocker.start) < 0) {
        result.push(createInterval(cursor, minInstant(blocker.start, interval.end)));
      }
      cursor = maxInstant(cursor, blocker.end);
      if (Temporal.Instant.compare(cursor, interval.end) >= 0) break;
      scanIndex += 1;
    }

    if (Temporal.Instant.compare(cursor, interval.end) < 0) {
      result.push(createInterval(cursor, interval.end));
    }
  }

  return Object.freeze(result);
}
