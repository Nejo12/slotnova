# `@slotnova/observability-server`

Server / worker **observability infrastructure** (task T013 of
`specs/001-platform-foundation-shell/tasks.md`, FR-053/FR-054/FR-057):

- **structured logger** — one JSON record per call, keyed by a stable `event`
  name (never free-form string concatenation), with `level` + ISO `time`,
  correlation context attached automatically, and arbitrary metadata redacted
  before it is written
- **correlation context** — `AsyncLocalStorage`-backed request/job context that
  survives `await`, stays isolated between concurrent flows, and never leaks
- **redaction** — denylist-based, recursive, non-mutating, circular-safe

This package is **server-only**. It must never enter a browser bundle — the
`no-observability-server-in-browser` dependency-cruiser rule
(`tooling/dependency-cruiser/.dependency-cruiser.cjs`) fails the build if
`apps/web`, `packages/ui` or `packages/observability-browser` import it.

## Not in scope here

The application log stream is **not the audit trail**. No vendor exporter is
wired — Sentry / Datadog / Grafana / Honeycomb / New Relic / vendor OTel
exporters are future **adapters** (FR-055). No metrics backend, no
high-cardinality labels (FR-056). NestJS middleware / interceptor integration
and worker job-context propagation are PR-05 and later.

## Entry point

| Import | Contains |
|---|---|
| `@slotnova/observability-server` | `createLogger`, `runWithContext` / `runWithChildContext` / `getContext` / `getCorrelationId` / `createCorrelationContext` / `generateCorrelationId`, `redact` / `REDACTED` |

## Usage sketch

```ts
import { createLogger, runWithContext } from "@slotnova/observability-server";

const log = createLogger({ base: { service: "api" } });

runWithContext({ correlationId: req.headers["x-correlation-id"] }, () => {
  log.info("workspace.created", { meta: { workspaceId, plan } });
  // -> {"level":"info","time":"…","event":"workspace.created",
  //     "service":"api","correlationId":"…","meta":{ "workspaceId":"…", … }}
});
```

`runWithChildContext(overrides, fn)` carries the current correlation id into
background work triggered by a request (FR-054).

`base` is for static deployment context only (`service`, `component`, `version`,
`region`, …). It may **not** carry a reserved field the logger owns — `level`,
`time`, `event`, `message`, `meta`, `correlationId`, `requestId`, `traceId`,
`workspaceId`, `userId` — `createLogger` throws at construction if it does, so
configuration can never shadow authoritative per-record data.

### Redaction

`redact(value, options?)` returns a defensive deep copy with every value under a
sensitive key replaced by the constant `"[REDACTED]"` — secrets are dropped
whole, never partially exposed. Covered key names (case-insensitive, separator-
insensitive): `password` / `passwd`, `secret` / `clientSecret`, `token` /
`accessToken` / `refreshToken` / `csrfToken`, `authorization`, `cookie` /
`set-cookie`, `apiKey`, `privateKey`, `cardNumber` / `pan`, `cvv` / `cvc`, plus
any `additionalKeys` the caller supplies. `Error` values are reduced to
`{ name, message }` with no stack unless `includeErrorStack` is set.
