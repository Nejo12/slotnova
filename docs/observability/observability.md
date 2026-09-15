# Observability Baseline

Observability is designed in before production rather than retrofitted after failures become difficult to diagnose.

## Standard

- structured JSON logs on the server
- request/correlation IDs propagated through API and worker execution
- OpenTelemetry-compatible traces and metrics
- frontend/backend error reporting with release/environment context
- no sensitive customer/payment data in logs or traces

## Domain visibility

Important domain commands should be traceable, especially:

- booking create/cancel/reschedule
- recovery candidate ranking / offer / acceptance / completion
- payment/refund commands and webhooks
- inventory adjustments
- integration synchronization
- permission/settings changes

## Metrics

Separate technical health from business metrics.

Technical examples:
- request latency/error rate
- worker queue/outbox lag
- database pool saturation
- external provider latency/failure
- retry/dead-letter counts

Business examples:
- recovery completion rate
- time to refill
- recovered revenue
- payment success/refund rate

Do not encode high-cardinality IDs as metric labels.

`@slotnova/observability-server`'s `metrics.ts` (T077) makes this structural: a
`Meter` is created in either the `"technical"` or `"business"` namespace, and
any label whose key is identifier- or secret-shaped (`requestId`,
`workspaceId`, `userId`, `jobId`, `email`, `token`, …) is rejected at the call
site rather than silently accepted. Points are exported through a
`MetricExporter` adapter — `createNoopExporter()` (default) and
`createInMemoryExporter()` (tests) ship today; a concrete OpenTelemetry/vendor
exporter is a later adapter, never a dependency of this package. PR-18 defines
only the technical instrument names in `TECHNICAL_METRIC_NAMES`; the business
namespace is reserved, with no business metric content invented here.

## Logging

Logs should answer what happened and where without becoming the audit store. Use stable event names and structured fields instead of free-form concatenated messages.

## Alerts

Alert on symptoms requiring action, not every isolated exception. Before production define ownership and runbooks for payment failures, worker backlog, provider outages, database connectivity, elevated API errors and authentication anomalies.

## Local/test

Observability helpers must be usable without requiring a hosted vendor. Vendor exporters are adapters. Tests should be able to assert emitted domain/telemetry events without network access.
