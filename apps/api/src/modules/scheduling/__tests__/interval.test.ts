import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  compareIntervals,
  createInterval,
  intervalContains,
  intervalsAreAdjacent,
  intervalsOverlap,
} from "../domain/interval.js";
import { InvalidIntervalBoundsError } from "../domain/scheduling-errors.js";

const at = (iso: string): Temporal.Instant => Temporal.Instant.from(iso);

describe("createInterval", () => {
  it("builds a half-open [start,end) value", () => {
    const interval = createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T17:00:00Z"));

    expect(interval.start.toString()).toBe("2025-06-02T09:00:00Z");
    expect(interval.end.toString()).toBe("2025-06-02T17:00:00Z");
  });

  it("is frozen (immutable value)", () => {
    const interval = createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T17:00:00Z"));

    expect(Object.isFrozen(interval)).toBe(true);
  });

  it("rejects an empty interval (start == end)", () => {
    expect(() => createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T09:00:00Z"))).toThrow(
      InvalidIntervalBoundsError,
    );
  });

  it("rejects an inverted interval (end < start)", () => {
    expect(() => createInterval(at("2025-06-02T10:00:00Z"), at("2025-06-02T09:00:00Z"))).toThrow(
      InvalidIntervalBoundsError,
    );
  });
});

describe("intervalsOverlap", () => {
  const nine = createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T10:00:00Z"));

  it("is false for disjoint intervals", () => {
    const later = createInterval(at("2025-06-02T11:00:00Z"), at("2025-06-02T12:00:00Z"));
    expect(intervalsOverlap(nine, later)).toBe(false);
    expect(intervalsOverlap(later, nine)).toBe(false);
  });

  it("is false for half-open adjacency (a.end == b.start) — SC-002", () => {
    const adjacent = createInterval(at("2025-06-02T10:00:00Z"), at("2025-06-02T11:00:00Z"));
    expect(intervalsOverlap(nine, adjacent)).toBe(false);
    expect(intervalsOverlap(adjacent, nine)).toBe(false);
    expect(intervalsAreAdjacent(nine, adjacent)).toBe(true);
  });

  it("is true for a one-nanosecond overlap", () => {
    const overlapping = createInterval(
      at("2025-06-02T09:59:59.999999999Z"),
      at("2025-06-02T11:00:00Z"),
    );
    expect(intervalsOverlap(nine, overlapping)).toBe(true);
  });

  it("is true for containment and exact match", () => {
    const inner = createInterval(at("2025-06-02T09:15:00Z"), at("2025-06-02T09:45:00Z"));
    expect(intervalsOverlap(nine, inner)).toBe(true);
    expect(intervalsOverlap(nine, nine)).toBe(true);
  });
});

describe("intervalContains", () => {
  const nine = createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T10:00:00Z"));

  it("includes the start instant and excludes the end instant", () => {
    expect(intervalContains(nine, at("2025-06-02T09:00:00Z"))).toBe(true);
    expect(intervalContains(nine, at("2025-06-02T09:59:59.999999999Z"))).toBe(true);
    expect(intervalContains(nine, at("2025-06-02T10:00:00Z"))).toBe(false);
    expect(intervalContains(nine, at("2025-06-02T08:59:59.999999999Z"))).toBe(false);
  });
});

describe("compareIntervals", () => {
  it("orders by start, then by end", () => {
    const a = createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T10:00:00Z"));
    const b = createInterval(at("2025-06-02T09:00:00Z"), at("2025-06-02T11:00:00Z"));
    const c = createInterval(at("2025-06-02T09:30:00Z"), at("2025-06-02T09:45:00Z"));

    expect(compareIntervals(a, b)).toBeLessThan(0);
    expect(compareIntervals(b, c)).toBeLessThan(0);
    expect(compareIntervals(a, a)).toBe(0);
    expect(compareIntervals(c, a)).toBeGreaterThan(0);
  });
});
