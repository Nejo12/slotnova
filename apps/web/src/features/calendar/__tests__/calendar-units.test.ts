import { describe, expect, it } from "vitest";

import { dayRangeOf, shiftDay, toDayKey, todayKey } from "../day-range.js";
import { isEmptyView, toCalendarEntries } from "../entries.js";
import { problemKindOf } from "../api/problem.js";
import { calendarKey } from "../api/keys.js";
import type { CalendarView } from "../api/types.js";
import { bookingCreatePath, calendarDayPath } from "../../../app/routes/routes.js";

describe("dayRangeOf", () => {
  it("maps a local day to its half-open [midnight, next midnight) window", () => {
    const range = dayRangeOf("2026-10-01");
    expect(range.day).toBe("2026-10-01");
    // Exactly 24 hours apart in absolute time only when the day has no DST
    // transition — what is always true is that `to` is the NEXT local day.
    expect(toDayKey(new Date(range.from))).toBe("2026-10-01");
    expect(toDayKey(new Date(range.to))).toBe("2026-10-02");
  });

  it("is bounded: `to` is strictly after `from`", () => {
    const range = dayRangeOf("2026-10-01");
    expect(new Date(range.to).getTime()).toBeGreaterThan(new Date(range.from).getTime());
  });

  it("degrades a malformed key to today rather than an invalid window", () => {
    expect(dayRangeOf("not-a-day").day).toBe(todayKey());
    expect(dayRangeOf("").day).toBe(todayKey());
    expect(dayRangeOf("2026-13-45").day).not.toBe("2026-13-45");
  });
});

describe("shiftDay", () => {
  it("steps backwards and forwards by one day", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-10-01", 1)).toBe("2026-10-02");
  });

  it("crosses a month and a year boundary", () => {
    expect(shiftDay("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("crosses a leap day", () => {
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });
});

function view(overrides: Partial<CalendarView> = {}): CalendarView {
  return {
    range: { start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z" },
    open: [],
    occupied: [],
    ...overrides,
  };
}

describe("toCalendarEntries", () => {
  it("returns one chronological list of both kinds", () => {
    const entries = toCalendarEntries(
      view({
        open: [{ start: "2026-10-01T08:00:00Z", end: "2026-10-01T16:00:00Z" }],
        occupied: [
          {
            bookingId: "b1",
            serviceId: "s1",
            startsAt: "2026-10-01T10:00:00Z",
            occupied: { start: "2026-10-01T09:55:00Z", end: "2026-10-01T10:55:00Z" },
            status: "confirmed",
          },
        ],
      }),
    );

    expect(entries.map((entry) => entry.kind)).toEqual(["open", "occupied"]);
    expect(entries.map((entry) => entry.start)).toEqual([
      "2026-10-01T08:00:00Z",
      "2026-10-01T09:55:00Z",
    ]);
  });

  it("keeps overlapping open and occupied intervals BOTH — it merges nothing", () => {
    const entries = toCalendarEntries(
      view({
        open: [{ start: "2026-10-01T08:00:00Z", end: "2026-10-01T16:00:00Z" }],
        occupied: [
          {
            bookingId: "b1",
            serviceId: "s1",
            startsAt: "2026-10-01T10:00:00Z",
            occupied: { start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" },
            status: "confirmed",
          },
        ],
      }),
    );
    // The browser never subtracts occupancy from availability: that would be
    // re-deriving on the client what Scheduling and Booking already own.
    expect(entries).toHaveLength(2);
  });

  it("orders an identical span occupied-first, deterministically", () => {
    const span = { start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" };
    const entries = toCalendarEntries(
      view({
        open: [span],
        occupied: [
          {
            bookingId: "b1",
            serviceId: "s1",
            startsAt: span.start,
            occupied: span,
            status: "confirmed",
          },
        ],
      }),
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["occupied", "open"]);
  });

  it("gives every entry a stable unique key", () => {
    const entries = toCalendarEntries(
      view({
        open: [
          { start: "2026-10-01T08:00:00Z", end: "2026-10-01T09:00:00Z" },
          { start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" },
        ],
      }),
    );
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });
});

describe("isEmptyView", () => {
  it("is true only when both halves are empty", () => {
    expect(isEmptyView(view())).toBe(true);
    expect(isEmptyView(view({ open: [{ start: "a", end: "b" }] }))).toBe(false);
  });
});

describe("calendarKey", () => {
  it("is workspace-scoped first, then range-scoped", () => {
    const key = calendarKey("ws-1", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z");
    expect(key[0]).toBe("ws");
    expect(key[1]).toBe("ws-1");
    expect(key).toContain("calendar");
  });

  it("gives two workspaces and two ranges four distinct keys", () => {
    const keys = [
      calendarKey("ws-1", "a", "b"),
      calendarKey("ws-2", "a", "b"),
      calendarKey("ws-1", "c", "d"),
      calendarKey("ws-2", "c", "d"),
    ].map((key) => JSON.stringify(key));
    expect(new Set(keys).size).toBe(4);
  });
});

describe("problemKindOf", () => {
  it("reads the machine-readable slug, never the human title", () => {
    expect(problemKindOf({ type: "https://slotnova.app/problems/forbidden" })).toBe("forbidden");
    expect(problemKindOf({ type: "https://example.test/problems/teapot" })).toBe("unknown");
    expect(problemKindOf(null)).toBe("unknown");
    expect(problemKindOf({ title: "Forbidden" })).toBe("unknown");
  });
});

describe("route helpers", () => {
  it("builds a deep-linkable Calendar day path", () => {
    expect(calendarDayPath()).toBe("/calendar");
    expect(calendarDayPath("2026-10-01")).toBe("/calendar?day=2026-10-01");
  });

  it("builds the create path with and without a prefill", () => {
    expect(bookingCreatePath()).toBe("/bookings/new");
    expect(bookingCreatePath({})).toBe("/bookings/new");
    expect(bookingCreatePath({ startsAt: "" })).toBe("/bookings/new");
    expect(bookingCreatePath({ startsAt: "2026-10-01T08:00:00Z" })).toBe(
      "/bookings/new?startsAt=2026-10-01T08%3A00%3A00Z",
    );
  });
});
