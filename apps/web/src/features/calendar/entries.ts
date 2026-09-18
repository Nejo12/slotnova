/**
 * The Calendar's display model: the composed payload flattened into ONE
 * chronological list of entries.
 *
 * This is presentation ordering and nothing else. No availability is
 * computed, no interval is merged, split or subtracted, and no overlap is
 * decided here — the server already returned the open intervals (Scheduling
 * resolved them, exceptions subtracted) and the occupied intervals (Booking
 * decided occupancy from its generated `blocking_range`). Open and occupied
 * entries CAN overlap in time, and that is correct rather than a conflict to
 * resolve: "the workspace is open 09:00–17:00" and "10:00–11:00 is booked"
 * are two true statements about the same hour, and the UI labels both in
 * words instead of silently reconciling them.
 */
import type { CalendarOccupiedStatus, CalendarView } from "./api/types.js";

export interface OpenEntry {
  readonly kind: "open";
  /** Stable React key; derived from the interval, which is unique within a payload. */
  readonly id: string;
  readonly start: string;
  readonly end: string;
}

export interface OccupiedEntry {
  readonly kind: "occupied";
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly bookingId: string;
  readonly startsAt: string;
  readonly status: CalendarOccupiedStatus;
}

export type CalendarEntry = OpenEntry | OccupiedEntry;

/**
 * Chronological by start, then by end, then occupied-before-open so an
 * identical span renders deterministically. A stable order matters for both
 * keyboard traversal and the component tests.
 */
export function toCalendarEntries(view: CalendarView): readonly CalendarEntry[] {
  const open: CalendarEntry[] = view.open.map((interval) => ({
    kind: "open",
    id: `open:${interval.start}:${interval.end}`,
    start: interval.start,
    end: interval.end,
  }));

  const occupied: CalendarEntry[] = view.occupied.map((entry) => ({
    kind: "occupied",
    id: `occupied:${entry.bookingId}`,
    start: entry.occupied.start,
    end: entry.occupied.end,
    bookingId: entry.bookingId,
    startsAt: entry.startsAt,
    status: entry.status,
  }));

  return [...occupied, ...open].sort(compareEntries);
}

function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end < b.end ? -1 : 1;
  if (a.kind === b.kind) return a.id < b.id ? -1 : 1;
  return a.kind === "occupied" ? -1 : 1;
}

/** True when the composed payload contains nothing at all to show. */
export function isEmptyView(view: CalendarView): boolean {
  return view.open.length === 0 && view.occupied.length === 0;
}
