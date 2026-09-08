import type { ErrorReporterSink, Report } from "../error-reporter.js";

/** Test-only sink that records every report it receives. Never shipped. */
export function createInMemorySink(): ErrorReporterSink & { readonly reports: Report[] } {
  const reports: Report[] = [];
  return {
    reports,
    send(report: Report): void {
      reports.push(report);
    },
  };
}
