import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { createInterval, type Interval } from "../domain/interval.js";
import {
  intersectIntervals,
  normalizeIntervals,
  subtractIntervals,
  unionIntervals,
} from "../domain/interval-set.js";

/** `h(9, 17)` → `[2025-06-02T09:00Z, 2025-06-02T17:00Z)`. Fixed date, no wall clock. */
function h(startHour: number, endHour: number): Interval {
  return createInterval(
    Temporal.Instant.from(`2025-06-02T${String(startHour).padStart(2, "0")}:00:00Z`),
    Temporal.Instant.from(`2025-06-02T${String(endHour).padStart(2, "0")}:00:00Z`),
  );
}

function render(intervals: readonly Interval[]): string[] {
  return intervals.map((interval) => `${interval.start.toString()}/${interval.end.toString()}`);
}

function expectSame(actual: readonly Interval[], expected: readonly Interval[]): void {
  expect(render(actual)).toEqual(render(expected));
}

describe("normalizeIntervals", () => {
  it("returns an empty set unchanged", () => {
    expect(normalizeIntervals([])).toEqual([]);
  });

  it("sorts unsorted input by start", () => {
    expectSame(normalizeIntervals([h(15, 16), h(9, 10), h(12, 13)]), [
      h(9, 10),
      h(12, 13),
      h(15, 16),
    ]);
  });

  it("merges overlapping intervals", () => {
    expectSame(normalizeIntervals([h(9, 12), h(11, 14)]), [h(9, 14)]);
  });

  it("merges an interval fully contained in another", () => {
    expectSame(normalizeIntervals([h(9, 17), h(11, 12)]), [h(9, 17)]);
  });

  it("coalesces adjacent intervals into one continuous availability span", () => {
    // `end == start` is NOT an overlap (SC-002) but IS continuous coverage:
    // coalescing keeps normalisation canonical without changing which instants
    // are covered (docs/testing/property-testing-conventions.md).
    expectSame(normalizeIntervals([h(9, 12), h(12, 17)]), [h(9, 17)]);
  });

  it("leaves a genuine gap alone", () => {
    expectSame(normalizeIntervals([h(9, 12), h(13, 17)]), [h(9, 12), h(13, 17)]);
  });

  it("is idempotent", () => {
    const once = normalizeIntervals([h(15, 16), h(9, 12), h(11, 13), h(16, 18)]);
    expectSame(normalizeIntervals(once), once);
  });

  it("does not mutate its input", () => {
    const input = [h(15, 16), h(9, 10)];
    normalizeIntervals(input);
    expectSame(input, [h(15, 16), h(9, 10)]);
  });
});

describe("unionIntervals", () => {
  it("merges both operands into one normalised set", () => {
    expectSame(unionIntervals([h(9, 12)], [h(11, 14), h(16, 17)]), [h(9, 14), h(16, 17)]);
  });

  it("is identity against an empty set", () => {
    expectSame(unionIntervals([h(9, 12)], []), [h(9, 12)]);
  });
});

describe("intersectIntervals", () => {
  it("is empty for disjoint operands", () => {
    expect(intersectIntervals([h(9, 10)], [h(11, 12)])).toEqual([]);
  });

  it("is empty for half-open adjacency", () => {
    expect(intersectIntervals([h(9, 12)], [h(12, 17)])).toEqual([]);
  });

  it("returns the shared span for a partial overlap", () => {
    expectSame(intersectIntervals([h(9, 13)], [h(11, 17)]), [h(11, 13)]);
  });

  it("returns the inner interval for containment", () => {
    expectSame(intersectIntervals([h(9, 17)], [h(11, 12)]), [h(11, 12)]);
  });

  it("returns the interval itself for an exact match", () => {
    expectSame(intersectIntervals([h(9, 17)], [h(9, 17)]), [h(9, 17)]);
  });

  it("handles multiple intervals on both sides", () => {
    expectSame(intersectIntervals([h(9, 12), h(14, 18)], [h(10, 15), h(16, 17)]), [
      h(10, 12),
      h(14, 15),
      h(16, 17),
    ]);
  });

  it("is empty when either side is empty", () => {
    expect(intersectIntervals([], [h(9, 17)])).toEqual([]);
    expect(intersectIntervals([h(9, 17)], [])).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  it("is identity when nothing overlaps", () => {
    expectSame(subtractIntervals([h(9, 12)], [h(13, 17)]), [h(9, 12)]);
  });

  it("is identity against an empty subtrahend", () => {
    expectSame(subtractIntervals([h(9, 12)], []), [h(9, 12)]);
  });

  it("removes an interval entirely when fully covered", () => {
    expect(subtractIntervals([h(9, 12)], [h(8, 17)])).toEqual([]);
  });

  it("trims the left edge", () => {
    expectSame(subtractIntervals([h(9, 17)], [h(8, 11)]), [h(11, 17)]);
  });

  it("trims the right edge", () => {
    expectSame(subtractIntervals([h(9, 17)], [h(15, 18)]), [h(9, 15)]);
  });

  it("splits one interval into two", () => {
    expectSame(subtractIntervals([h(9, 17)], [h(12, 13)]), [h(9, 12), h(13, 17)]);
  });

  it("applies multiple blocking intervals", () => {
    expectSame(subtractIntervals([h(9, 18)], [h(10, 11), h(13, 14)]), [
      h(9, 10),
      h(11, 13),
      h(14, 18),
    ]);
  });

  it("does not remove any time for a merely adjacent blocker", () => {
    expectSame(subtractIntervals([h(9, 12)], [h(12, 17)]), [h(9, 12)]);
    expectSame(subtractIntervals([h(12, 17)], [h(9, 12)]), [h(12, 17)]);
  });

  it("normalises the source before subtracting", () => {
    expectSame(subtractIntervals([h(12, 17), h(9, 12)], [h(11, 13)]), [h(9, 11), h(13, 17)]);
  });
});
