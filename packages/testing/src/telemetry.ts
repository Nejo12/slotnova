/**
 * `@slotnova/testing/telemetry` — in-memory telemetry / domain-event sink (task T018).
 *
 * A tiny capture buffer for tests that need to assert *what* a unit emitted —
 * domain events, tracing spans, metric points — without a network call, a
 * hosted provider or a vendor SDK (FR-055, ADR-024 §"Internal in-process
 * domain events").
 *
 * It is deliberately generic: a `name` plus an arbitrary `payload`. It is **not**
 * the audit trail (ADR-019) and does no metrics-dashboard aggregation. Records
 * keep a strict emission order via a 0-based `sequence`.
 *
 * ## Interop
 *
 * The sink satisfies {@link TelemetryEmitter}, so a unit under test that depends
 * on a `{ emit(name, payload?) }` port can take the sink directly. This package
 * does not import any server observability infrastructure to provide that.
 */

export interface TelemetryRecord {
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** 0-based position in emission order. */
  readonly sequence: number;
  /** Deterministic ISO instant (injected `clock`, or a synthetic monotonic default). */
  readonly at: string;
}

/** The port a unit under test can depend on; {@link TelemetrySink} implements it. */
export interface TelemetryEmitter {
  emit(name: string, payload?: Record<string, unknown>): void;
}

export interface TelemetrySinkOptions {
  /**
   * Timestamp source for captured records. Defaults to a synthetic monotonic
   * clock derived from the record count (no wall-clock dependence).
   */
  readonly clock?: () => string;
}

const SYNTHETIC_EPOCH_MS = Date.parse("2026-01-01T00:00:00.000Z");

export interface TelemetrySink extends TelemetryEmitter {
  /** Every captured record, in emission order. A defensive copy. */
  readonly records: readonly TelemetryRecord[];
  /** Drop every captured record and reset the sequence counter. */
  clear(): void;
  /** All records with this exact name, in emission order. */
  find(name: string): TelemetryRecord[];
  /** The first record with this name, or `undefined`. */
  first(name: string): TelemetryRecord | undefined;
  /** Count of records with this name, or the total when `name` is omitted. */
  count(name?: string): number;
  /** Distinct names captured so far, in first-seen order. */
  names(): string[];

  /** Assert exactly-one-or-more: returns the first matching record or throws. */
  assertEmitted(name: string): TelemetryRecord;
  /** Assert the count of a named event. */
  assertEmittedTimes(name: string, expected: number): void;
  /** Assert a named event was never emitted. */
  assertNotEmitted(name: string): void;
}

export function createTelemetrySink(options: TelemetrySinkOptions = {}): TelemetrySink {
  const records: TelemetryRecord[] = [];
  const clock =
    options.clock ?? (() => new Date(SYNTHETIC_EPOCH_MS + records.length).toISOString());

  const sink: TelemetrySink = {
    emit(name, payload) {
      records.push({
        name,
        payload: Object.freeze({ ...(payload ?? {}) }),
        sequence: records.length,
        at: clock(),
      });
    },

    get records() {
      return [...records];
    },

    clear() {
      records.length = 0;
    },

    find(name) {
      return records.filter((record) => record.name === name);
    },

    first(name) {
      return records.find((record) => record.name === name);
    },

    count(name) {
      return name === undefined ? records.length : sink.find(name).length;
    },

    names() {
      const seen = new Set<string>();
      for (const record of records) seen.add(record.name);
      return [...seen];
    },

    assertEmitted(name) {
      const match = sink.first(name);
      if (match === undefined) {
        throw new Error(
          `Expected telemetry event "${name}" to be emitted, but it was not.${summary(records)}`,
        );
      }
      return match;
    },

    assertEmittedTimes(name, expected) {
      const actual = sink.count(name);
      if (actual !== expected) {
        throw new Error(
          `Expected telemetry event "${name}" to be emitted ${expected} time(s), but it was emitted ${actual} time(s).${summary(records)}`,
        );
      }
    },

    assertNotEmitted(name) {
      const matches = sink.find(name);
      if (matches.length > 0) {
        throw new Error(
          `Expected telemetry event "${name}" not to be emitted, but it was emitted ${matches.length} time(s) at sequence ${matches
            .map((record) => record.sequence)
            .join(", ")}.${summary(records)}`,
        );
      }
    },
  };

  return sink;
}

function summary(records: readonly TelemetryRecord[]): string {
  if (records.length === 0) return " No telemetry events were captured.";
  const rendered = records.map((record) => `${record.sequence}:${record.name}`).join(", ");
  return ` Captured (in order): [${rendered}].`;
}
