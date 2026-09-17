import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { type Interval } from "../domain/interval.js";
import {
  MAX_EXPANSION_HORIZON_DAYS,
  createWeeklyAvailabilityPattern,
  expandWeeklyAvailability,
} from "../domain/recurrence.js";
import {
  ExpansionHorizonExceededError,
  InvalidEffectiveRangeError,
  InvalidExpansionRangeError,
  InvalidLocalTimeRangeError,
  InvalidTimeZoneError,
  InvalidWeeklyAvailabilityRuleError,
} from "../domain/scheduling-errors.js";

const MINUTES_PER_HOUR = 60;
const at = (hour: number, minute = 0): number => hour * MINUTES_PER_HOUR + minute;
const date = (iso: string): Temporal.PlainDate => Temporal.PlainDate.from(iso);

function render(intervals: readonly Interval[]): string[] {
  return intervals.map((interval) => `${interval.start.toString()}/${interval.end.toString()}`);
}

describe("createWeeklyAvailabilityPattern", () => {
  it("accepts a valid IANA timezone and weekly rules", () => {
    const pattern = createWeeklyAvailabilityPattern({
      timeZone: "Europe/London",
      rules: [{ dayOfWeek: 1, startMinuteOfDay: at(9), endMinuteOfDay: at(17) }],
    });

    expect(pattern.timeZone).toBe("Europe/London");
    expect(pattern.rules).toHaveLength(1);
    expect(Object.isFrozen(pattern)).toBe(true);
  });

  it("rejects an unknown timezone id", () => {
    expect(() => createWeeklyAvailabilityPattern({ timeZone: "Mars/Olympus", rules: [] })).toThrow(
      InvalidTimeZoneError,
    );
  });

  it("rejects a bare UTC-offset in place of an IANA zone id", () => {
    // FR-010 requires an IANA identifier: a fixed offset cannot express DST.
    expect(() => createWeeklyAvailabilityPattern({ timeZone: "+05:00", rules: [] })).toThrow(
      InvalidTimeZoneError,
    );
  });

  it("rejects a day-of-week outside ISO 1..7", () => {
    expect(() =>
      createWeeklyAvailabilityPattern({
        timeZone: "Europe/London",
        rules: [{ dayOfWeek: 0 as 1, startMinuteOfDay: at(9), endMinuteOfDay: at(17) }],
      }),
    ).toThrow(InvalidWeeklyAvailabilityRuleError);
  });

  it("rejects a non-integer or out-of-range local time", () => {
    for (const rule of [
      { startMinuteOfDay: -1, endMinuteOfDay: at(9) },
      { startMinuteOfDay: 1440, endMinuteOfDay: 1441 },
      { startMinuteOfDay: at(9), endMinuteOfDay: 1441 },
      { startMinuteOfDay: 9.5, endMinuteOfDay: at(17) },
    ]) {
      expect(() =>
        createWeeklyAvailabilityPattern({
          timeZone: "Europe/London",
          rules: [{ dayOfWeek: 1, ...rule }],
        }),
      ).toThrow(InvalidLocalTimeRangeError);
    }
  });

  it("rejects an empty or inverted local time range", () => {
    expect(() =>
      createWeeklyAvailabilityPattern({
        timeZone: "Europe/London",
        rules: [{ dayOfWeek: 1, startMinuteOfDay: at(9), endMinuteOfDay: at(9) }],
      }),
    ).toThrow(InvalidLocalTimeRangeError);
    expect(() =>
      createWeeklyAvailabilityPattern({
        timeZone: "Europe/London",
        rules: [{ dayOfWeek: 1, startMinuteOfDay: at(17), endMinuteOfDay: at(9) }],
      }),
    ).toThrow(InvalidLocalTimeRangeError);
  });

  it("rejects overlapping rules within the same local day", () => {
    expect(() =>
      createWeeklyAvailabilityPattern({
        timeZone: "Europe/London",
        rules: [
          { dayOfWeek: 1, startMinuteOfDay: at(9), endMinuteOfDay: at(13) },
          { dayOfWeek: 1, startMinuteOfDay: at(12), endMinuteOfDay: at(17) },
        ],
      }),
    ).toThrow(InvalidWeeklyAvailabilityRuleError);
  });

  it("allows adjacent rules within the same local day, and identical times on different days", () => {
    expect(() =>
      createWeeklyAvailabilityPattern({
        timeZone: "Europe/London",
        rules: [
          { dayOfWeek: 1, startMinuteOfDay: at(9), endMinuteOfDay: at(12) },
          { dayOfWeek: 1, startMinuteOfDay: at(12), endMinuteOfDay: at(17) },
          { dayOfWeek: 2, startMinuteOfDay: at(9), endMinuteOfDay: at(17) },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects an effective window that is empty or inverted", () => {
    expect(() =>
      createWeeklyAvailabilityPattern({
        timeZone: "Europe/London",
        rules: [],
        effectiveFrom: date("2025-06-02"),
        effectiveUntil: date("2025-06-02"),
      }),
    ).toThrow(InvalidEffectiveRangeError);
  });
});

describe("expandWeeklyAvailability", () => {
  const pattern = createWeeklyAvailabilityPattern({
    timeZone: "Europe/London",
    rules: [
      { dayOfWeek: 1, startMinuteOfDay: at(9), endMinuteOfDay: at(12) },
      { dayOfWeek: 1, startMinuteOfDay: at(13), endMinuteOfDay: at(17) },
      { dayOfWeek: 3, startMinuteOfDay: at(9), endMinuteOfDay: at(17) },
    ],
  });

  it("expands one local day into UTC instants (BST: local 09:00 → 08:00Z)", () => {
    const intervals = expandWeeklyAvailability(pattern, {
      from: date("2025-06-02"),
      to: date("2025-06-03"),
    });

    expect(render(intervals)).toEqual([
      "2025-06-02T08:00:00Z/2025-06-02T11:00:00Z",
      "2025-06-02T12:00:00Z/2025-06-02T16:00:00Z",
    ]);
  });

  it("expands one local day into UTC instants (GMT: local 09:00 → 09:00Z)", () => {
    const intervals = expandWeeklyAvailability(pattern, {
      from: date("2025-12-01"),
      to: date("2025-12-02"),
    });

    expect(render(intervals)).toEqual([
      "2025-12-01T09:00:00Z/2025-12-01T12:00:00Z",
      "2025-12-01T13:00:00Z/2025-12-01T17:00:00Z",
    ]);
  });

  it("treats the expansion range as half-open [from,to) over local dates", () => {
    // Monday 2025-06-02 is excluded when it is the exclusive end.
    const intervals = expandWeeklyAvailability(pattern, {
      from: date("2025-06-01"),
      to: date("2025-06-02"),
    });

    expect(intervals).toEqual([]);
  });

  it("returns intervals sorted and non-overlapping across several weeks", () => {
    const intervals = expandWeeklyAvailability(pattern, {
      from: date("2025-06-02"),
      to: date("2025-06-16"),
    });

    // 2 Mondays × 2 rules + 2 Wednesdays × 1 rule
    expect(intervals).toHaveLength(6);
    for (let index = 1; index < intervals.length; index += 1) {
      expect(
        Temporal.Instant.compare(intervals[index - 1]!.end, intervals[index]!.start),
      ).toBeLessThanOrEqual(0);
    }
  });

  it("supports a rule ending at local midnight (minute 1440)", () => {
    const lateShift = createWeeklyAvailabilityPattern({
      timeZone: "Europe/London",
      rules: [{ dayOfWeek: 1, startMinuteOfDay: at(22), endMinuteOfDay: 1440 }],
    });

    expect(
      render(
        expandWeeklyAvailability(lateShift, { from: date("2025-12-01"), to: date("2025-12-02") }),
      ),
    ).toEqual(["2025-12-01T22:00:00Z/2025-12-02T00:00:00Z"]);
  });

  it("clamps expansion to the pattern's half-open effective window", () => {
    const bounded = createWeeklyAvailabilityPattern({
      timeZone: "Europe/London",
      rules: [{ dayOfWeek: 1, startMinuteOfDay: at(9), endMinuteOfDay: at(17) }],
      effectiveFrom: date("2025-06-09"),
      effectiveUntil: date("2025-06-16"),
    });

    const intervals = expandWeeklyAvailability(bounded, {
      from: date("2025-06-01"),
      to: date("2025-06-30"),
    });

    // Only Monday 2025-06-09: 2025-06-02 precedes `effectiveFrom` and
    // 2025-06-16 is excluded by the half-open `effectiveUntil`.
    expect(render(intervals)).toEqual(["2025-06-09T08:00:00Z/2025-06-09T16:00:00Z"]);
  });

  it("returns an empty set when the pattern has no rules", () => {
    const empty = createWeeklyAvailabilityPattern({ timeZone: "Europe/London", rules: [] });

    expect(
      expandWeeklyAvailability(empty, { from: date("2025-06-02"), to: date("2025-06-09") }),
    ).toEqual([]);
  });

  it("is independent of the host machine's timezone", () => {
    const previous = process.env["TZ"];
    const baseline = render(
      expandWeeklyAvailability(pattern, { from: date("2025-06-02"), to: date("2025-06-09") }),
    );
    try {
      for (const hostZone of ["UTC", "Pacific/Kiritimati", "America/Anchorage"]) {
        process.env["TZ"] = hostZone;
        expect(
          render(
            expandWeeklyAvailability(pattern, { from: date("2025-06-02"), to: date("2025-06-09") }),
          ),
        ).toEqual(baseline);
      }
    } finally {
      if (previous === undefined) delete process.env["TZ"];
      else process.env["TZ"] = previous;
    }
  });
});

describe("expansion horizon (FR-015)", () => {
  const pattern = createWeeklyAvailabilityPattern({
    timeZone: "Europe/London",
    rules: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek: dayOfWeek as 1,
      startMinuteOfDay: at(0),
      endMinuteOfDay: 1440,
    })),
  });

  it("rejects an empty or inverted range", () => {
    expect(() =>
      expandWeeklyAvailability(pattern, { from: date("2025-06-02"), to: date("2025-06-02") }),
    ).toThrow(InvalidExpansionRangeError);
    expect(() =>
      expandWeeklyAvailability(pattern, { from: date("2025-06-03"), to: date("2025-06-02") }),
    ).toThrow(InvalidExpansionRangeError);
  });

  it("accepts exactly the maximum horizon", () => {
    const from = date("2025-01-01");
    expect(() =>
      expandWeeklyAvailability(pattern, {
        from,
        to: from.add({ days: MAX_EXPANSION_HORIZON_DAYS }),
      }),
    ).not.toThrow();
  });

  it("rejects one day beyond the maximum horizon", () => {
    const from = date("2025-01-01");
    expect(() =>
      expandWeeklyAvailability(pattern, {
        from,
        to: from.add({ days: MAX_EXPANSION_HORIZON_DAYS + 1 }),
      }),
    ).toThrow(ExpansionHorizonExceededError);
  });

  it("rejects a decade-long range rather than materialising it (no unbounded expansion)", () => {
    expect(() =>
      expandWeeklyAvailability(pattern, { from: date("2025-01-01"), to: date("2035-01-01") }),
    ).toThrow(ExpansionHorizonExceededError);
  });

  it("caps the number of produced intervals at the horizon", () => {
    const from = date("2025-01-01");
    const intervals = expandWeeklyAvailability(pattern, {
      from,
      to: from.add({ days: MAX_EXPANSION_HORIZON_DAYS }),
    });

    // An all-day, every-day pattern coalesces into one continuous span; in no
    // case can the output exceed one interval per expanded local day.
    expect(intervals.length).toBeLessThanOrEqual(MAX_EXPANSION_HORIZON_DAYS);
    expect(intervals).toHaveLength(1);
  });
});
