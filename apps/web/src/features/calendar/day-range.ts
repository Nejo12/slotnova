/**
 * The Calendar's bounded range model and its presentation formatting.
 *
 * ## One range mode: a single day
 *
 * The Calendar deliberately implements ONE bounded range mode — the local
 * day — rather than month/week/day machinery. Approved Figma for
 * `06 — Calendar` was not reachable from this environment (the Figma MCP
 * server is unauthenticated here, the same finding PR-08 recorded), and no
 * committed artifact mandates multiple modes: `spec.md` FR-030–FR-032 ask
 * for a composition with deliberate desktop/mobile layouts and explicit
 * states, `tasks.md` PR-09 asks for "date navigation", and
 * `contracts/calendar.contract.md` defines one bounded `[from, to)` window.
 * Building week/month switching on top of that would be inventing product
 * surface from absence. A day is also the smallest window that makes the
 * occupancy view truthful at a glance, and the endpoint supports any bounded
 * window, so a future mode is additive rather than a rewrite.
 *
 * ## Why `Date` is used here
 *
 * The hard prohibition on raw `Date` covers DOMAIN SCHEDULING code. All
 * recurrence, DST, timezone and interval reasoning lives in the Scheduling
 * domain on the server and is not re-implemented here: this module only
 * converts between "the day the operator is looking at, in their own local
 * zone" and the two absolute instants the API window needs, and formats
 * instants for display through `Intl`. That is a browser presentation
 * adapter, exactly as `booking/format.ts` documents for its own
 * `datetime-local` conversion.
 */

/** A calendar day identified by its LOCAL `YYYY-MM-DD`, plus the absolute window it maps to. */
export interface DayRange {
  /** Local date key, e.g. `2026-09-01`. Used in the query key and the URL. */
  readonly day: string;
  /** Inclusive ISO-8601 instant at local midnight. */
  readonly from: string;
  /** EXCLUSIVE ISO-8601 instant at the next local midnight. */
  readonly to: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `Date` (local) -> `YYYY-MM-DD` in the viewer's own zone, never UTC-shifted. */
export function toDayKey(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's local day key. */
export function todayKey(now: Date = new Date()): string {
  return toDayKey(now);
}

/**
 * `YYYY-MM-DD` -> that local day's half-open absolute window. An
 * unparseable key falls back to today rather than requesting a nonsense
 * window: a bad URL must degrade to a usable Calendar, not an error.
 */
export function dayRangeOf(day: string, now: Date = new Date()): DayRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const anchor = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0)
    : startOfLocalDay(now);
  if (Number.isNaN(anchor.getTime())) return dayRangeOf(toDayKey(now), now);

  const next = new Date(anchor);
  next.setDate(next.getDate() + 1);

  return { day: toDayKey(anchor), from: anchor.toISOString(), to: next.toISOString() };
}

function startOfLocalDay(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** The adjacent day key, `step` days away (`-1` previous, `+1` next). */
export function shiftDay(day: string, step: number): string {
  const { day: normalized } = dayRangeOf(day);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)!;
  const anchor = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  anchor.setDate(anchor.getDate() + step);
  return toDayKey(anchor);
}

/** `2026-09-01` -> `Tuesday, 1 September 2026`, in the viewer's own locale. */
export function formatDayHeading(day: string): string {
  const { from } = dayRangeOf(day);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(from));
}

/** An instant -> `09:00` in the viewer's own locale and zone. */
export function formatTime(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
}

/**
 * An instant range as one readable label, e.g. `09:00 – 17:00`. Both bounds
 * are always spelled out: the meaning of a Calendar entry must never depend
 * on its position or colour alone.
 */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}
