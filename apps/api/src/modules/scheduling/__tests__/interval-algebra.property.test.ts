import { Temporal } from "@js-temporal/polyfill";
import { fc, propertyParameters } from "@slotnova/testing/property";
import { describe, expect, it } from "vitest";

import {
  createInterval,
  intervalContains,
  intervalsOverlap,
  type Interval,
} from "../domain/interval.js";
import {
  intersectIntervals,
  normalizeIntervals,
  subtractIntervals,
  unionIntervals,
} from "../domain/interval-set.js";

/**
 * Property coverage for the pure interval algebra (FR-013, SC-002,
 * `docs/testing/property-testing-conventions.md` → "Interval overlap &
 * normalisation").
 *
 * Every arbitrary is derived from a fixed base instant: no `Date`, no wall
 * clock, no host timezone, no network, no database.
 */
const BASE = Temporal.Instant.from("2025-06-02T00:00:00Z");

function atOffset(seconds: number): Temporal.Instant {
  return BASE.add({ seconds });
}

const intervalArb: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 60 }))
  .map(([startOffset, length]) =>
    createInterval(atOffset(startOffset), atOffset(startOffset + length)),
  );

const intervalSetArb: fc.Arbitrary<readonly Interval[]> = fc.array(intervalArb, { maxLength: 8 });

/** Membership oracle: is `instant` covered by any interval in the set? */
function covers(set: readonly Interval[], instant: Temporal.Instant): boolean {
  return set.some((interval) => intervalContains(interval, instant));
}

/**
 * Probe instants that can distinguish any two of these sets: every endpoint,
 * plus one second either side of it (the half-open boundary is exactly where a
 * wrong implementation differs).
 */
function probeInstants(...sets: readonly (readonly Interval[])[]): readonly Temporal.Instant[] {
  const seen = new Map<string, Temporal.Instant>();
  for (const set of sets) {
    for (const interval of set) {
      for (const endpoint of [interval.start, interval.end]) {
        for (const delta of [-1, 0, 1]) {
          const probe = endpoint.add({ seconds: delta });
          seen.set(probe.toString(), probe);
        }
      }
    }
  }
  return [...seen.values()];
}

function expectSameCoverage(
  actual: readonly Interval[],
  expected: (instant: Temporal.Instant) => boolean,
  probes: readonly Temporal.Instant[],
): void {
  for (const probe of probes) {
    expect(
      covers(actual, probe),
      `coverage mismatch at ${probe.toString()} (probe is decisive for half-open semantics)`,
    ).toBe(expected(probe));
  }
}

/** A normalised set is sorted, pairwise disjoint, and has no adjacent pair left to coalesce. */
function expectNormalised(set: readonly Interval[]): void {
  for (let index = 1; index < set.length; index += 1) {
    const previous = set[index - 1]!;
    const current = set[index]!;
    expect(Temporal.Instant.compare(previous.start, current.start)).toBeLessThan(0);
    // Strictly after, not merely non-overlapping: adjacency is coalesced.
    expect(Temporal.Instant.compare(previous.end, current.start)).toBeLessThan(0);
  }
  for (const interval of set) {
    expect(Temporal.Instant.compare(interval.start, interval.end)).toBeLessThan(0);
  }
}

function render(set: readonly Interval[]): string[] {
  return set.map((interval) => `${interval.start.toString()}/${interval.end.toString()}`);
}

describe("normalizeIntervals — properties", () => {
  it("is idempotent", () => {
    fc.assert(
      fc.property(intervalSetArb, (set) => {
        const once = normalizeIntervals(set);
        expect(render(normalizeIntervals(once))).toEqual(render(once));
      }),
      propertyParameters(),
    );
  });

  it("produces a sorted, disjoint, fully coalesced set", () => {
    fc.assert(
      fc.property(intervalSetArb, (set) => {
        expectNormalised(normalizeIntervals(set));
      }),
      propertyParameters(),
    );
  });

  it("covers exactly the same instants as its input", () => {
    fc.assert(
      fc.property(intervalSetArb, (set) => {
        const normalised = normalizeIntervals(set);
        expectSameCoverage(
          normalised,
          (probe) => covers(set, probe),
          probeInstants(set, normalised),
        );
      }),
      propertyParameters(),
    );
  });
});

describe("unionIntervals — properties", () => {
  it("covers exactly the union of both operands and is normalised", () => {
    fc.assert(
      fc.property(intervalSetArb, intervalSetArb, (left, right) => {
        const union = unionIntervals(left, right);
        expectNormalised(union);
        expectSameCoverage(
          union,
          (probe) => covers(left, probe) || covers(right, probe),
          probeInstants(left, right, union),
        );
      }),
      propertyParameters(),
    );
  });
});

describe("intersectIntervals — properties", () => {
  it("covers exactly the instants covered by both operands", () => {
    fc.assert(
      fc.property(intervalSetArb, intervalSetArb, (left, right) => {
        const intersection = intersectIntervals(left, right);
        expectNormalised(intersection);
        expectSameCoverage(
          intersection,
          (probe) => covers(left, probe) && covers(right, probe),
          probeInstants(left, right, intersection),
        );
      }),
      propertyParameters(),
    );
  });

  it("is a subset of each operand", () => {
    fc.assert(
      fc.property(intervalSetArb, intervalSetArb, (left, right) => {
        const intersection = intersectIntervals(left, right);
        for (const probe of probeInstants(left, right, intersection)) {
          if (!covers(intersection, probe)) continue;
          expect(covers(left, probe)).toBe(true);
          expect(covers(right, probe)).toBe(true);
        }
      }),
      propertyParameters(),
    );
  });

  it("is commutative under the normalised representation", () => {
    fc.assert(
      fc.property(intervalSetArb, intervalSetArb, (left, right) => {
        expect(render(intersectIntervals(left, right))).toEqual(
          render(intersectIntervals(right, left)),
        );
      }),
      propertyParameters(),
    );
  });
});

describe("subtractIntervals — properties", () => {
  it("covers exactly the source minus the removed set", () => {
    fc.assert(
      fc.property(intervalSetArb, intervalSetArb, (source, removed) => {
        const difference = subtractIntervals(source, removed);
        expectNormalised(difference);
        expectSameCoverage(
          difference,
          (probe) => covers(source, probe) && !covers(removed, probe),
          probeInstants(source, removed, difference),
        );
      }),
      propertyParameters(),
    );
  });

  it("never overlaps any removed interval", () => {
    fc.assert(
      fc.property(intervalSetArb, intervalSetArb, (source, removed) => {
        const difference = subtractIntervals(source, removed);
        for (const kept of difference) {
          for (const blocker of removed) {
            expect(intervalsOverlap(kept, blocker)).toBe(false);
          }
        }
      }),
      propertyParameters(),
    );
  });

  it("subtracting nothing is normalisation", () => {
    fc.assert(
      fc.property(intervalSetArb, (source) => {
        expect(render(subtractIntervals(source, []))).toEqual(render(normalizeIntervals(source)));
      }),
      propertyParameters(),
    );
  });
});

describe("half-open adjacency — properties", () => {
  it("treats `a.end === b.start` as non-overlapping for every generated boundary", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 1, max: 60 }),
          fc.integer({ min: 1, max: 60 }),
        ),
        ([startOffset, firstLength, secondLength]) => {
          const boundary = startOffset + firstLength;
          const first = createInterval(atOffset(startOffset), atOffset(boundary));
          const second = createInterval(atOffset(boundary), atOffset(boundary + secondLength));

          expect(intervalsOverlap(first, second)).toBe(false);
          expect(intervalsOverlap(second, first)).toBe(false);
          expect(intersectIntervals([first], [second])).toEqual([]);
          expect(render(subtractIntervals([first], [second]))).toEqual(render([first]));
        },
      ),
      propertyParameters({ numRuns: 200 }),
    );
  });
});
