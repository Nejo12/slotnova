/**
 * Metrics seam: technical vs business separation + a vendor-neutral exporter
 * adapter (FR-055, FR-056, T077).
 *
 * Two structurally distinct {@link MetricNamespace}s exist so a technical
 * platform metric (request latency, outbox lag, worker/queue state, db pool
 * state) can never be confused with a business metric (recovery completion
 * rate, recovered revenue, …) at the type level. PR-18 defines the
 * *technical* instrument names in {@link TECHNICAL_METRIC_NAMES} only — the
 * business namespace is reserved via {@link createBusinessMeter} but carries
 * no product-metric content here; that arrives with the product phases that
 * need it.
 *
 * The shape (name, kind, value, attributes, timestamp) is deliberately
 * OpenTelemetry-compatible so a concrete OTel SDK/vendor exporter can be
 * wrapped as a {@link MetricExporter} later without this package taking a
 * dependency on it. Local/CI default to {@link createNoopExporter} — no
 * network call is ever made by this module.
 *
 * {@link MetricExporter.export} is deliberately synchronous-only for PR-18:
 * there is no retry/buffering/error-handling infrastructure here, so an
 * exporter that could reject asynchronously would risk an unhandled
 * rejection with nothing to observe it. A future vendor/OTel exporter that is
 * inherently asynchronous must adapt at its own adapter boundary (e.g. fire
 * its network call and swallow/queue failures internally); it must not widen
 * this interface back to `Promise<void>`.
 */

import { isSensitiveFieldKey } from "./redaction.js";

export type MetricNamespace = "technical" | "business";
export type InstrumentKind = "counter" | "histogram" | "gauge";

/**
 * Metric label values. Kept to primitives only — never an object a caller
 * could smuggle a nested identifier through.
 */
export type MetricAttributes = Readonly<Record<string, string | number | boolean>>;

export interface MetricPoint {
  readonly namespace: MetricNamespace;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly value: number;
  readonly attributes: MetricAttributes;
  /** ISO-8601 timestamp. */
  readonly at: string;
}

/**
 * Vendor-neutral export adapter. A concrete OTel/vendor exporter implements
 * this. Synchronous-only by design for PR-18 — see the module doc.
 */
export interface MetricExporter {
  export(points: readonly MetricPoint[]): void;
}

export interface Counter {
  add(value: number, attributes?: MetricAttributes): void;
}
export interface Histogram {
  record(value: number, attributes?: MetricAttributes): void;
}
export interface Gauge {
  set(value: number, attributes?: MetricAttributes): void;
}

export interface Meter {
  readonly namespace: MetricNamespace;
  counter(name: string): Counter;
  histogram(name: string): Histogram;
  gauge(name: string): Gauge;
}

export interface MeterOptions {
  readonly namespace: MetricNamespace;
  /** Default: {@link createNoopExporter} — no network dependency. */
  readonly exporter?: MetricExporter;
  /** Timestamp source. Default: `() => new Date().toISOString()`. */
  readonly clock?: () => string;
}

/** Stable, dot-namespaced technical instrument names (`docs/observability/observability.md`). */
export const TECHNICAL_METRIC_NAMES = {
  httpRequestDurationMs: "http.request.duration_ms",
  httpRequestsTotal: "http.requests.total",
  httpErrorsTotal: "http.errors.total",
  outboxLagMs: "outbox.lag_ms",
  outboxQueueDepth: "outbox.queue.depth",
  workerJobDurationMs: "worker.job.duration_ms",
  dbPoolSize: "db.pool.size",
  dbPoolWaiting: "db.pool.waiting",
} as const;

/**
 * A label is rejected when it is an identifier-shaped key (FR-056: "no
 * high-cardinality IDs as metric labels" — any `*Id`-suffixed key such as
 * `requestId`, `correlationId`, `workspaceId`, `userId`, `jobId`,
 * `invitationId`, `membershipId`, `traceId`, …) or a secret-shaped one.
 *
 * The secret-shaped check reuses {@link isSensitiveFieldKey}, the exact same
 * predicate `redaction.ts` uses to decide what to mask in logs, so metrics
 * and log redaction never carry two independently-maintained secret lists
 * that can drift apart. The two call sites choose different *consequences*
 * for a match — redaction masks the value, this rejects the metric call
 * outright, because a label is structural (cardinality), not a value to
 * hide — but they agree on what counts as sensitive.
 */
function isUnsafeMetricLabel(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "") return false;
  if (normalized.endsWith("id")) return true;
  return isSensitiveFieldKey(key);
}

function assertLowCardinalityAttributes(
  name: string,
  attributes: MetricAttributes | undefined,
): void {
  if (!attributes) return;
  const blocked = Object.keys(attributes).filter(isUnsafeMetricLabel);
  if (blocked.length > 0) {
    throw new Error(
      `metrics: refusing high-cardinality/sensitive label(s) on "${name}": ${blocked.join(", ")}`,
    );
  }
}

/** Default exporter: discards every point. No network, no vendor, safe for local/CI. */
export function createNoopExporter(): MetricExporter {
  return {
    export(): void {
      // intentionally discarded
    },
  };
}

export interface InMemoryMetricExporter extends MetricExporter {
  /** Every exported point, in export order. A defensive copy. */
  readonly points: readonly MetricPoint[];
  clear(): void;
}

/** Captures every exported point in memory — for tests, with no network access. */
export function createInMemoryExporter(): InMemoryMetricExporter {
  const points: MetricPoint[] = [];
  return {
    export(batch: readonly MetricPoint[]): void {
      points.push(...batch);
    },
    get points() {
      return [...points];
    },
    clear(): void {
      points.length = 0;
    },
  };
}

export function createMeter(options: MeterOptions): Meter {
  const exporter = options.exporter ?? createNoopExporter();
  const clock = options.clock ?? ((): string => new Date().toISOString());
  const namespace = options.namespace;

  const emit = (
    name: string,
    kind: InstrumentKind,
    value: number,
    attributes?: MetricAttributes,
  ): void => {
    assertLowCardinalityAttributes(name, attributes);
    exporter.export([{ namespace, name, kind, value, attributes: attributes ?? {}, at: clock() }]);
  };

  return {
    namespace,
    counter: (name: string): Counter => ({
      add: (value, attributes) => emit(name, "counter", value, attributes),
    }),
    histogram: (name: string): Histogram => ({
      record: (value, attributes) => emit(name, "histogram", value, attributes),
    }),
    gauge: (name: string): Gauge => ({
      set: (value, attributes) => emit(name, "gauge", value, attributes),
    }),
  };
}

/** Technical-namespace meter — platform health only (see {@link TECHNICAL_METRIC_NAMES}). */
export function createTechnicalMeter(exporter?: MetricExporter): Meter {
  return createMeter(exporter ? { namespace: "technical", exporter } : { namespace: "technical" });
}

/**
 * Business-namespace meter. Reserved seam: PR-18 defines no business metric
 * names or content. A later product phase names and records its own.
 */
export function createBusinessMeter(exporter?: MetricExporter): Meter {
  return createMeter(exporter ? { namespace: "business", exporter } : { namespace: "business" });
}
