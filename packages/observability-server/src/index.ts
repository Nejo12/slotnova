/**
 * `@slotnova/observability-server` — server/worker observability infrastructure.
 *
 * Structured JSON logging, AsyncLocalStorage correlation context and
 * sensitive-field redaction. Server-only: this package must never enter a
 * browser bundle (enforced by the `no-observability-server-in-browser`
 * dependency-cruiser rule). It is not the audit trail, and it wires no vendor
 * exporter — those are future adapters.
 */

export {
  createCorrelationContext,
  generateCorrelationId,
  getContext,
  getCorrelationId,
  runWithChildContext,
  runWithContext,
  type CorrelationContext,
  type CorrelationContextInput,
} from "./als-context.js";

export {
  createLogger,
  type Logger,
  type LoggerOptions,
  type LogInput,
  type LogLevel,
  type LogRecord,
} from "./logger.js";

export { redact, REDACTED, type RedactOptions } from "./redaction.js";

export {
  createBusinessMeter,
  createInMemoryExporter,
  createMeter,
  createNoopExporter,
  createTechnicalMeter,
  TECHNICAL_METRIC_NAMES,
  type Counter,
  type Gauge,
  type Histogram,
  type InMemoryMetricExporter,
  type InstrumentKind,
  type Meter,
  type MeterOptions,
  type MetricAttributes,
  type MetricExporter,
  type MetricNamespace,
  type MetricPoint,
} from "./metrics.js";
