/**
 * Local wall time → absolute instant, with one documented DST policy (FR-014,
 * ADR-010, `research.md` R-DST).
 *
 * A recurring availability rule is written in *local wall time*. Twice a year a
 * wall-clock time is either missing (spring forward) or repeated (fall back), so
 * "09:00 local" is not always exactly one instant. This module is the only place
 * that decides what happens then.
 *
 * ## Policy
 *
 * - **Unique** local time → that instant.
 * - **Repeated** local time (fall back, the hour occurs twice) → the **earlier**
 *   occurrence, for both the start and the end boundary. This is `research.md`
 *   R-DST's Founder-approved choice (`disambiguation: 'earlier'`): deterministic,
 *   needs no user prompt, and expands a rule **once** rather than duplicating it
 *   because the local hour happened twice.
 * - **Missing** local time (spring forward, the hour does not exist) → the
 *   instant at which the gap ends, i.e. the offset-transition instant itself,
 *   for both boundaries. FR-014 requires the non-existent hour to be *skipped*:
 *   clamping to the transition means the expanded interval covers exactly those
 *   instants whose local time really falls inside the rule, and a rule that lies
 *   entirely inside the gap collapses to nothing (its start and end resolve to
 *   the same instant) instead of being silently shifted to a time the operator
 *   never declared.
 *
 * Nothing here reads the host clock or the host timezone: every conversion names
 * an explicit IANA zone.
 */

import { Temporal } from "@js-temporal/polyfill";

import { InvalidTimeZoneError } from "./scheduling-errors.js";

/** A leading sign means a fixed UTC offset (e.g. `+05:00`), which cannot express DST. */
const FIXED_OFFSET_PREFIX = /^[+−-]/u;

const PROBE_INSTANT = Temporal.Instant.fromEpochMilliseconds(0);

/** Throws `InvalidTimeZoneError` unless `value` is an IANA zone identifier. */
export function assertValidIanaTimeZone(value: string): void {
  if (value.length === 0 || FIXED_OFFSET_PREFIX.test(value)) {
    throw new InvalidTimeZoneError(value);
  }
  try {
    PROBE_INSTANT.toZonedDateTimeISO(value);
  } catch {
    throw new InvalidTimeZoneError(value);
  }
}

/** How a local wall-clock time maps onto the timeline in a given zone. */
export type WallClockResolution = "unique" | "repeated" | "missing";

export function classifyLocalDateTime(
  local: Temporal.PlainDateTime,
  timeZone: string,
): WallClockResolution {
  const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  // A missing local time is the only case where the resolved wall time differs
  // from the requested one (Temporal shifts it out of the gap).
  if (!earlier.toPlainDateTime().equals(local)) return "missing";

  const later = local.toZonedDateTime(timeZone, { disambiguation: "later" });
  return earlier.toInstant().equals(later.toInstant()) ? "unique" : "repeated";
}

/**
 * Resolve a local wall-clock date-time to a single instant under the policy
 * documented above. Both interval boundaries use this same function, so the
 * policy cannot drift between them.
 */
export function resolveLocalDateTime(
  local: Temporal.PlainDateTime,
  timeZone: string,
): Temporal.Instant {
  const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  if (classifyLocalDateTime(local, timeZone) !== "missing") {
    // Unique, or repeated and resolved to the first occurrence (R-DST).
    return earlier.toInstant();
  }

  // Missing: `earlier` sits just before the gap, so the next offset transition
  // is the instant the gap ends. Clamp to it.
  const transition = earlier.getTimeZoneTransition("next");
  return (
    transition?.toInstant() ??
    // Defensive only: a zone reporting a gap must have a following transition.
    local.toZonedDateTime(timeZone, { disambiguation: "later" }).toInstant()
  );
}
