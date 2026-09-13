/**
 * IANA timezone validation for `Location.timezone` (data-model.md, ADR-010).
 *
 * Phase 1 stores the timezone id as data only — no scheduling behavior reads
 * it yet (that begins with Scheduling). Validation happens here, at the
 * runtime boundary the future identity repository/application layer calls
 * before a write; it is not (and cannot be, portably) a database CHECK
 * constraint, since PostgreSQL has no built-in IANA timezone-name catalogue.
 */

const SUPPORTED_TIME_ZONES = new Set<string>(Intl.supportedValuesOf("timeZone"));

/**
 * "UTC" is a legitimate IANA identifier (canonically linked to "Etc/UTC") but
 * is not guaranteed to appear in `Intl.supportedValuesOf("timeZone")`'s
 * enumeration, which depends on the runtime's ICU/CLDR version.
 *
 * Deliberately NOT using `Intl.DateTimeFormat`'s own constructor as the
 * validator: it accepts case-insensitive input and fixed-offset abbreviations
 * like "EST" that are not real IANA zone ids, which would let inconsistent
 * spellings of the same zone land in storage.
 */
const EXTRA_VALID_TIME_ZONES = new Set<string>(["UTC"]);

export function isValidIanaTimeZone(value: string): boolean {
  return SUPPORTED_TIME_ZONES.has(value) || EXTRA_VALID_TIME_ZONES.has(value);
}

export class InvalidTimeZoneError extends Error {
  override readonly name = "InvalidTimeZoneError";

  constructor(readonly value: string) {
    super(`"${value}" is not a valid IANA timezone id`);
  }
}

export function assertValidIanaTimeZone(value: string): void {
  if (!isValidIanaTimeZone(value)) {
    throw new InvalidTimeZoneError(value);
  }
}
