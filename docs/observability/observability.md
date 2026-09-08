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

## Logging

Logs should answer what happened and where without becoming the audit store. Use stable event names and structured fields instead of free-form concatenated messages.

## Alerts

Alert on symptoms requiring action, not every isolated exception. Before production define ownership and runbooks for payment failures, worker backlog, provider outages, database connectivity, elevated API errors and authentication anomalies.

## Local/test

Observability helpers must be usable without requiring a hosted vendor. Vendor exporters are adapters. Tests should be able to assert emitted domain/telemetry events without network access.
