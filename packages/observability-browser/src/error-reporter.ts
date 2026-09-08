/**
 * Provider-neutral browser error-reporting seam (FR-058).
 *
 * `createErrorReporter` returns an {@link ErrorReporter} that normalizes what it
 * is given, stamps release / environment / timestamp context, and hands a plain
 * {@link Report} to a caller-installed {@link ErrorReporterSink}. This package
 * has no Sentry / vendor dependency and no server-observability dependency; a
 * real provider is installed later as a sink adapter.
 *
 * Contract: `reportError` and `reportMessage` never throw and never reject. A
 * sink that throws or returns a rejecting promise is caught and forwarded to
 * `onReportFailure` (default: no-op), so a provider outage cannot break the app.
 */

/** Normalized form of any thrown value. */
export interface NormalizedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** Correlation/trace ids, passed explicitly by the caller (never ambient here). */
export interface ReportCorrelation {
  readonly correlationId?: string;
  readonly traceId?: string;
}

export type MessageLevel = "info" | "warning" | "error";

interface ReportContext {
  readonly release: string;
  readonly environment: string;
  readonly timestamp: string;
  readonly correlation?: ReportCorrelation;
  readonly metadata?: Record<string, unknown>;
}

export interface ErrorReport extends ReportContext {
  readonly kind: "error";
  readonly error: NormalizedError;
}

export interface MessageReport extends ReportContext {
  readonly kind: "message";
  readonly message: string;
  readonly level: MessageLevel;
}

export type Report = ErrorReport | MessageReport;

/** Where normalized reports are delivered. Installed by the application. */
export interface ErrorReporterSink {
  send(report: Report): void | Promise<void>;
}

export interface ReportOptions {
  readonly correlation?: ReportCorrelation;
  readonly metadata?: Record<string, unknown>;
}

export interface MessageReportOptions extends ReportOptions {
  readonly level?: MessageLevel;
}

export interface ErrorReporterConfig {
  /** Delivery target. Required — no default provider is wired. */
  readonly sink: ErrorReporterSink;
  /** Release identifier (version / build sha). */
  readonly release: string;
  /** Deployment environment (e.g. `"production"`). */
  readonly environment: string;
  /** Timestamp source. Default: `() => new Date().toISOString()`. */
  readonly clock?: () => string;
  /** Called when the sink throws or rejects. Default: no-op. */
  readonly onReportFailure?: (error: unknown) => void;
}

export interface ErrorReporter {
  reportError(error: unknown, options?: ReportOptions): void;
  reportMessage(message: string, options?: MessageReportOptions): void;
}

const CIRCULAR = "[CIRCULAR]";
const TRUNCATED = "[TRUNCATED]";
const MAX_DEPTH = 8;

function normalizeError(value: unknown): NormalizedError {
  if (value instanceof Error) {
    const normalized: { name: string; message: string; stack?: string } = {
      name: value.name || "Error",
      message: value.message,
    };
    if (typeof value.stack === "string") normalized.stack = value.stack;
    return normalized;
  }
  if (typeof value === "string") return { name: "Error", message: value };
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = typeof record["name"] === "string" ? record["name"] : "Error";
    const message =
      typeof record["message"] === "string" ? record["message"] : safeStringify(value);
    return { name, message };
  }
  return { name: "Error", message: String(value) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Deep, JSON-safe copy of caller metadata: drops functions and `undefined`,
 * renders `Error`/`Date`, caps depth, and marks cycles. Never mutates input.
 * Denylist redaction of payload contents is not this seam's job.
 */
function normalizeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();

  const walk = (node: unknown, depth: number): unknown => {
    if (node === null || typeof node !== "object") {
      if (typeof node === "bigint") return node.toString();
      return node;
    }
    if (depth >= MAX_DEPTH) return TRUNCATED;
    if (seen.has(node)) return CIRCULAR;
    seen.add(node);
    try {
      if (node instanceof Error) return { name: node.name, message: node.message };
      if (node instanceof Date) return node.toISOString();
      if (Array.isArray(node)) {
        return node.map((item) => (typeof item === "function" ? null : walk(item, depth + 1)));
      }
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (typeof child === "function" || child === undefined) continue;
        out[key] = walk(child, depth + 1);
      }
      return out;
    } finally {
      seen.delete(node);
    }
  };

  return walk(input, 0) as Record<string, unknown>;
}

export function createErrorReporter(config: ErrorReporterConfig): ErrorReporter {
  const clock = config.clock ?? ((): string => new Date().toISOString());
  const onReportFailure = config.onReportFailure ?? ((): void => undefined);

  const deliver = (report: Report): void => {
    try {
      const result = config.sink.send(report);
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).then(undefined, onReportFailure);
      }
    } catch (error) {
      onReportFailure(error);
    }
  };

  const context = (options: ReportOptions | undefined): ReportContext => {
    const base: {
      release: string;
      environment: string;
      timestamp: string;
      correlation?: ReportCorrelation;
      metadata?: Record<string, unknown>;
    } = {
      release: config.release,
      environment: config.environment,
      timestamp: clock(),
    };
    if (options?.correlation) base.correlation = options.correlation;
    if (options?.metadata) base.metadata = normalizeMetadata(options.metadata);
    return base;
  };

  return {
    reportError(error, options) {
      deliver({ kind: "error", error: normalizeError(error), ...context(options) });
    },
    reportMessage(message, options) {
      deliver({
        kind: "message",
        message,
        level: options?.level ?? "error",
        ...context(options),
      });
    },
  };
}
