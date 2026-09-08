/**
 * `@slotnova/observability-browser` — provider-neutral browser error-reporting.
 *
 * An {@link ErrorReporter} port with a pluggable {@link ErrorReporterSink}: the
 * application installs a real provider (Sentry, …) as a sink adapter later. This
 * package carries no vendor dependency and no server-observability dependency
 * (the latter is enforced by the `no-observability-server-in-browser`
 * dependency-cruiser rule).
 */

export {
  createErrorReporter,
  type ErrorReporter,
  type ErrorReporterConfig,
  type ErrorReporterSink,
  type ErrorReport,
  type MessageLevel,
  type MessageReport,
  type MessageReportOptions,
  type NormalizedError,
  type Report,
  type ReportCorrelation,
  type ReportOptions,
} from "./error-reporter.js";
