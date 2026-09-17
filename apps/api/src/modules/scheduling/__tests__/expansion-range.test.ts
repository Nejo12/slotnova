/**
 * `assertValidExpansionRange` (PR-04, issue #66) — the bounded-horizon guard
 * PR-04 extracted from `expandWeeklyAvailability` so `resolve` can reject an
 * out-of-bounds request before touching the database (FR-015).
 *
 * This asserts the extraction preserved the merged PR-03 behaviour exactly:
 * the standalone guard and the expansion it was extracted from must agree,
 * and 370 days must be accepted while 371 is rejected.
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import {
  MAX_EXPANSION_HORIZON_DAYS,
  assertValidExpansionRange,
  createWeeklyAvailabilityPattern,
  expandWeeklyAvailability,
} from "../domain/recurrence.js";
import {
  ExpansionHorizonExceededError,
  InvalidExpansionRangeError,
} from "../domain/scheduling-errors.js";

const FROM = Temporal.PlainDate.from("2026-01-01");

const pattern = createWeeklyAvailabilityPattern({
  timeZone: "Europe/London",
  rules: [{ dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 1020 }],
});

describe("assertValidExpansionRange", () => {
  it("pins the Founder-approved horizon at 370 days", () => {
    expect(MAX_EXPANSION_HORIZON_DAYS).toBe(370);
  });

  it("accepts a range of exactly the maximum horizon", () => {
    const to = FROM.add({ days: MAX_EXPANSION_HORIZON_DAYS });
    expect(() => {
      assertValidExpansionRange({ from: FROM, to });
    }).not.toThrow();
    expect(() => expandWeeklyAvailability(pattern, { from: FROM, to })).not.toThrow();
  });

  it("rejects a range one day beyond the maximum horizon", () => {
    const to = FROM.add({ days: MAX_EXPANSION_HORIZON_DAYS + 1 });
    expect(() => {
      assertValidExpansionRange({ from: FROM, to });
    }).toThrow(ExpansionHorizonExceededError);
    // The expansion path rejects identically -- one rule, one implementation.
    expect(() => expandWeeklyAvailability(pattern, { from: FROM, to })).toThrow(
      ExpansionHorizonExceededError,
    );
  });

  it("rejects an empty or inverted range", () => {
    expect(() => {
      assertValidExpansionRange({ from: FROM, to: FROM });
    }).toThrow(InvalidExpansionRangeError);
    expect(() => {
      assertValidExpansionRange({ from: FROM, to: FROM.subtract({ days: 1 }) });
    }).toThrow(InvalidExpansionRangeError);
  });
});
