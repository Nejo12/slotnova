/**
 * Deterministic identifiers and timestamps for test data (task T017).
 *
 * These are **not** production ID or time formats — they exist so a builder has
 * a stable, readable default and so two tests that build "the same" entity get
 * byte-identical values. A test that needs a specific value passes it as an
 * override.
 */

/** `prefix_00000001`-style id. Stable for a given `(prefix, sequence)`. */
export function testId(prefix: string, sequence = 1): string {
  return `${prefix}_${String(sequence).padStart(8, "0")}`;
}

/** Fixed reference instant for time-bearing fixtures. */
export const TEST_EPOCH_ISO = "2026-01-01T00:00:00.000Z";

const TEST_EPOCH_MS = Date.parse(TEST_EPOCH_ISO);

/**
 * ISO instant `offsetMinutes` from {@link TEST_EPOCH_ISO}. Uses `Date` only to
 * format an already-computed instant — this is fixture formatting, not domain
 * scheduling logic.
 */
export function testTimestamp(offsetMinutes = 0): string {
  return new Date(TEST_EPOCH_MS + offsetMinutes * 60_000).toISOString();
}
