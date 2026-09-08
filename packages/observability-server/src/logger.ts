/**
 * Structured server logger (FR-053).
 *
 * Every call produces exactly one JSON record on a single line, keyed by a
 * stable `event` name rather than a free-form message. Correlation context is
 * attached automatically from {@link getContext}; arbitrary metadata is passed
 * only through `meta` and is always redacted first.
 *
 * The application log stream is not the audit trail, and this module wires no
 * vendor exporter — Sentry / Datadog / OTel exporters are future adapters.
 */

import { getContext } from "./als-context.js";
import { redact, type RedactOptions } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** One emitted log record. Correlation fields appear only when a context is active. */
export interface LogRecord {
  level: LogLevel;
  /** ISO-8601 timestamp. */
  time: string;
  /** Stable, dot-namespaced event name. */
  event: string;
  message?: string;
  correlationId?: string;
  requestId?: string;
  traceId?: string;
  workspaceId?: string;
  userId?: string;
  /** Redacted structured metadata. */
  meta?: Record<string, unknown>;
  /** Static fields from {@link LoggerOptions.base} are spread in at this level. */
  [key: string]: unknown;
}

/** Optional per-call details. `event` (the first argument) stays the primary key. */
export interface LogInput {
  message?: string;
  meta?: Record<string, unknown>;
}

export interface LoggerOptions {
  /** Where a serialized record line is written. Default: `process.stdout`. */
  sink?: (line: string) => void;
  /** Timestamp source. Default: `() => new Date().toISOString()`. */
  clock?: () => string;
  /** Static fields merged into every record (redacted once at construction). */
  base?: Record<string, unknown>;
  /** Passed through to {@link redact} for every `meta` payload. */
  redactionOptions?: RedactOptions;
  /** Minimum level to emit. Default: `"info"`. */
  level?: LogLevel;
}

export interface Logger {
  debug(event: string, input?: LogInput): void;
  info(event: string, input?: LogInput): void;
  warn(event: string, input?: LogInput): void;
  error(event: string, input?: LogInput): void;
}

const CORRELATION_FIELDS = [
  "correlationId",
  "requestId",
  "traceId",
  "workspaceId",
  "userId",
] as const;

const defaultSink = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? defaultSink;
  const clock = options.clock ?? ((): string => new Date().toISOString());
  const minWeight = LEVEL_WEIGHT[options.level ?? "info"];
  const redactionOptions = options.redactionOptions;
  const base =
    options.base === undefined
      ? undefined
      : (redact(options.base, redactionOptions) as Record<string, unknown>);

  const emit = (level: LogLevel, event: string, input?: LogInput): void => {
    if (LEVEL_WEIGHT[level] < minWeight) return;

    const record: LogRecord = { level, time: clock(), event };
    if (base) Object.assign(record, base);

    const context = getContext();
    if (context) {
      for (const field of CORRELATION_FIELDS) {
        const value = context[field];
        if (typeof value === "string") record[field] = value;
      }
    }

    if (input?.message !== undefined) record.message = input.message;
    if (input?.meta !== undefined) {
      record.meta = redact(input.meta, redactionOptions) as Record<string, unknown>;
    }

    try {
      sink(JSON.stringify(record));
    } catch {
      sink(
        JSON.stringify({
          level: "error",
          time: record.time,
          event: "observability.log_serialization_failed",
          correlationId: record.correlationId,
          failedEvent: event,
        }),
      );
    }
  };

  return {
    debug: (event, input) => emit("debug", event, input),
    info: (event, input) => emit("info", event, input),
    warn: (event, input) => emit("warn", event, input),
    error: (event, input) => emit("error", event, input),
  };
}
