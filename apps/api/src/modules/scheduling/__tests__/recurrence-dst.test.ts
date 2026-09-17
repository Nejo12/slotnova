import { Temporal } from "@js-temporal/polyfill";
import { fc, propertyParameters } from "@slotnova/testing/property";
import { describe, expect, it } from "vitest";

import { type Interval } from "../domain/interval.js";
import {
  createWeeklyAvailabilityPattern,
  expandWeeklyAvailability,
  type IsoDayOfWeek,
} from "../domain/recurrence.js";

/**
 * DST behaviour (FR-014, SC-004, ADR-010, `research.md` R-DST).
 *
 * Every fixture names an explicit IANA zone and an explicit local date — the
 * host machine's timezone is never consulted, and no test reads the clock.
 *
 * Fixtures:
 * - America/New_York 2025-03-09: 02:00 → 03:00 (the 02:00 hour does not exist)
 * - America/New_York 2025-11-02: 02:00 → 01:00 (the 01:00 hour occurs twice)
 * - Europe/London    2025-03-30: 01:00 → 02:00
 * - Europe/London    2025-10-26: 02:00 → 01:00
 *
 * All four dates are Sundays (ISO day-of-week 7).
 */
const SUNDAY: IsoDayOfWeek = 7;
const MINUTES_PER_HOUR = 60;
const at = (hour: number, minute = 0): number => hour * MINUTES_PER_HOUR + minute;

function render(intervals: readonly Interval[]): string[] {
  return intervals.map((interval) => `${interval.start.toString()}/${interval.end.toString()}`);
}

function expandOneDay(
  timeZone: string,
  localDate: string,
  range: { readonly startMinuteOfDay: number; readonly endMinuteOfDay: number },
): readonly Interval[] {
  const pattern = createWeeklyAvailabilityPattern({
    timeZone,
    rules: [{ dayOfWeek: SUNDAY, ...range }],
  });
  const from = Temporal.PlainDate.from(localDate);
  return expandWeeklyAvailability(pattern, { from, to: from.add({ days: 1 }) });
}

function hoursOf(interval: Interval): number {
  return interval.start.until(interval.end).total({ unit: "hour" });
}

describe("DST forward gap — the non-existent hour is skipped", () => {
  it("shortens a span that straddles the gap to its real elapsed time", () => {
    // Local 00:00 EST (-05:00) → 05:00Z; local 06:00 EDT (-04:00) → 10:00Z.
    // Wall-clock span is 6 hours; real elapsed availability is 5.
    const intervals = expandOneDay("America/New_York", "2025-03-09", {
      startMinuteOfDay: at(0),
      endMinuteOfDay: at(6),
    });

    expect(render(intervals)).toEqual(["2025-03-09T05:00:00Z/2025-03-09T10:00:00Z"]);
    expect(hoursOf(intervals[0]!)).toBe(5);
  });

  it("produces nothing at all for a rule that lies entirely inside the gap", () => {
    expect(
      expandOneDay("America/New_York", "2025-03-09", {
        startMinuteOfDay: at(2),
        endMinuteOfDay: at(3),
      }),
    ).toEqual([]);
  });

  it("clamps a start inside the gap forward to the instant the gap ends", () => {
    // Local 02:30 never happens; availability begins when local time becomes
    // 03:00 EDT (07:00Z) — not at 01:30 EST, which would offer time the rule
    // never declared.
    const intervals = expandOneDay("America/New_York", "2025-03-09", {
      startMinuteOfDay: at(2, 30),
      endMinuteOfDay: at(6),
    });

    expect(render(intervals)).toEqual(["2025-03-09T07:00:00Z/2025-03-09T10:00:00Z"]);
  });

  it("clamps an end inside the gap back to the instant the gap begins", () => {
    // Local 01:00 EST (06:00Z) until the clocks jump at 02:00 EST (07:00Z).
    const intervals = expandOneDay("America/New_York", "2025-03-09", {
      startMinuteOfDay: at(1),
      endMinuteOfDay: at(2, 30),
    });

    expect(render(intervals)).toEqual(["2025-03-09T06:00:00Z/2025-03-09T07:00:00Z"]);
  });

  it("applies the same rule in a different zone (Europe/London 2025-03-30)", () => {
    expect(
      render(
        expandOneDay("Europe/London", "2025-03-30", {
          startMinuteOfDay: at(0),
          endMinuteOfDay: at(6),
        }),
      ),
    ).toEqual(["2025-03-30T00:00:00Z/2025-03-30T05:00:00Z"]);

    expect(
      expandOneDay("Europe/London", "2025-03-30", {
        startMinuteOfDay: at(1),
        endMinuteOfDay: at(2),
      }),
    ).toEqual([]);
  });

  it("is unaffected on the surrounding ordinary Sundays", () => {
    expect(
      render(
        expandOneDay("America/New_York", "2025-03-02", {
          startMinuteOfDay: at(0),
          endMinuteOfDay: at(6),
        }),
      ),
    ).toEqual(["2025-03-02T05:00:00Z/2025-03-02T11:00:00Z"]);

    expect(
      render(
        expandOneDay("America/New_York", "2025-03-16", {
          startMinuteOfDay: at(0),
          endMinuteOfDay: at(6),
        }),
      ),
    ).toEqual(["2025-03-16T04:00:00Z/2025-03-16T10:00:00Z"]);
  });
});

describe("DST repeated hour — resolved to the earlier occurrence (research.md R-DST)", () => {
  it("resolves an ambiguous boundary to the first occurrence, producing one interval", () => {
    // Local 01:00 happens twice (05:00Z as EDT, 06:00Z as EST). R-DST picks the
    // earlier one; the rule is expanded once, not twice.
    const intervals = expandOneDay("America/New_York", "2025-11-02", {
      startMinuteOfDay: at(1),
      endMinuteOfDay: at(1, 30),
    });

    expect(render(intervals)).toEqual(["2025-11-02T05:00:00Z/2025-11-02T05:30:00Z"]);
    expect(intervals).toHaveLength(1);
  });

  it("spans the repeated hour exactly once when the rule crosses the transition", () => {
    // 01:00 EDT (05:00Z) → 03:00 EST (08:00Z): a 2-hour wall-clock span whose
    // real elapsed time is 3 hours, expressed as ONE interval.
    const intervals = expandOneDay("America/New_York", "2025-11-02", {
      startMinuteOfDay: at(1),
      endMinuteOfDay: at(3),
    });

    expect(render(intervals)).toEqual(["2025-11-02T05:00:00Z/2025-11-02T08:00:00Z"]);
    expect(intervals).toHaveLength(1);
    expect(hoursOf(intervals[0]!)).toBe(3);
  });

  it("lengthens a straddling span by exactly the repeated hour", () => {
    const intervals = expandOneDay("America/New_York", "2025-11-02", {
      startMinuteOfDay: at(0),
      endMinuteOfDay: at(6),
    });

    expect(render(intervals)).toEqual(["2025-11-02T04:00:00Z/2025-11-02T11:00:00Z"]);
    expect(hoursOf(intervals[0]!)).toBe(7);
  });

  it("applies the same rule in a different zone (Europe/London 2025-10-26)", () => {
    // Local 01:00 BST = 00:00Z (earlier occurrence), local 01:30 BST = 00:30Z.
    expect(
      render(
        expandOneDay("Europe/London", "2025-10-26", {
          startMinuteOfDay: at(1),
          endMinuteOfDay: at(1, 30),
        }),
      ),
    ).toEqual(["2025-10-26T00:00:00Z/2025-10-26T00:30:00Z"]);
  });
});

describe("DST — expansion invariants across transition weeks (property)", () => {
  const zoneArb = fc.constantFrom("America/New_York", "Europe/London", "Australia/Lord_Howe");
  const transitionWeekStartArb = fc.constantFrom(
    "2025-03-03",
    "2025-03-24",
    "2025-10-20",
    "2025-10-27",
    "2025-04-01",
    "2025-09-29",
  );

  it("never produces an overlapping, unsorted, empty or duplicated interval", () => {
    fc.assert(
      fc.property(
        zoneArb,
        transitionWeekStartArb,
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 1, max: 1440 }),
        (timeZone, weekStart, dayOfWeek, startMinuteOfDay, length) => {
          const endMinuteOfDay = Math.min(startMinuteOfDay + length, 1440);
          fc.pre(endMinuteOfDay > startMinuteOfDay);

          const pattern = createWeeklyAvailabilityPattern({
            timeZone,
            rules: [{ dayOfWeek: dayOfWeek as IsoDayOfWeek, startMinuteOfDay, endMinuteOfDay }],
          });
          const from = Temporal.PlainDate.from(weekStart);
          const intervals = expandWeeklyAvailability(pattern, { from, to: from.add({ days: 14 }) });

          // At most one occurrence per matching local day — a repeated local
          // hour must never split or duplicate an occurrence.
          expect(intervals.length).toBeLessThanOrEqual(2);

          for (const interval of intervals) {
            expect(Temporal.Instant.compare(interval.start, interval.end)).toBeLessThan(0);
            // No occurrence can be longer than a wall-clock day plus the
            // largest real-world DST shift.
            expect(hoursOf(interval)).toBeLessThanOrEqual(25);
          }
          for (let index = 1; index < intervals.length; index += 1) {
            expect(
              Temporal.Instant.compare(intervals[index - 1]!.end, intervals[index]!.start),
            ).toBeLessThan(0);
          }
        },
      ),
      propertyParameters({ numRuns: 150 }),
    );
  });
});
