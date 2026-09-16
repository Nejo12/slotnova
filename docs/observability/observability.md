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
any label is checked before it is ever handed to an exporter. A label key is
**rejected outright** (the call throws; nothing is exported) when either is
true:

- it is identifier-shaped — any key matching a `*Id`-suffix pattern
  (`requestId`, `correlationId`, `workspaceId`, `userId`, `jobId`,
  `invitationId`, `membershipId`, `traceId`, and similarly-shaped keys), or
- it is secret-shaped, per the exact same `isSensitiveFieldKey` predicate
  `redaction.ts` uses to decide what to mask in logs (`authorization`,
  `cookie`/`set-cookie`, `password`, `token`/`accessToken`/`refreshToken`,
  `secret`/`clientSecret`, `apiKey`/`x-api-key`, `privateKey`,
  `cardNumber`/`PAN`, `cvv`/`cvc`, `email`, …).

`metrics.ts` imports and reuses this predicate from `redaction.ts` rather than
maintaining a second, independent secret-key list — log redaction and metric
label safety are always in agreement about what counts as sensitive; they
differ only in consequence (redaction masks the *value* under a matching key
so the log line still exists; the metrics seam refuses the *call* outright,
because a label is structural/cardinality, not a value that can be partially
hidden). Low-cardinality operational labels — `route`, `method`, `outcome`,
`status`, `queue`, `operation` — are unaffected and remain the supported way
to dimension a technical metric.

Points are exported through a `MetricExporter` adapter whose `export()` is
**synchronous only** (`void`, never `Promise<void>`) — PR-18 has no
retry/buffering/error-handling infrastructure for a rejecting exporter
promise, so widening the contract would risk an unhandled rejection with
nothing to observe it. `createNoopExporter()` (default) and
`createInMemoryExporter()` (tests) ship today, both synchronous, and neither
makes a network call. A future concrete OpenTelemetry/vendor exporter — which
is typically asynchronous — must adapt at its own adapter boundary (e.g. fire
its network call and handle/queue failures internally) rather than this
interface becoming `Promise`-returning again. PR-18 defines only the
technical instrument names in `TECHNICAL_METRIC_NAMES`; the business
namespace is reserved, with no business metric content invented here.

## Logging

Logs should answer what happened and where without becoming the audit store. Use stable event names and structured fields instead of free-form concatenated messages.

## Alerts

Alert on symptoms requiring action, not every isolated exception. Before production define ownership and runbooks for payment failures, worker backlog, provider outages, database connectivity, elevated API errors and authentication anomalies.

## Local/test

Observability helpers must be usable without requiring a hosted vendor. Vendor exporters are adapters. Tests should be able to assert emitted domain/telemetry events without network access.
