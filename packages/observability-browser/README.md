# `@slotnova/observability-browser`

Provider-neutral **browser error-reporting seam** (task T014 of
`specs/001-platform-foundation-shell/tasks.md`, FR-058).

`createErrorReporter` returns an `ErrorReporter` that:

- **normalizes** any thrown value into `{ name, message, stack? }`
- stamps **release**, **environment** and a **timestamp** onto every report
- carries **correlation / trace ids** only when the caller passes them explicitly
  (nothing ambient — this package does not depend on the server context)
- **normalizes metadata** into a JSON-safe deep copy (drops functions /
  `undefined`, renders `Error` / `Date`, caps depth, marks cycles) without
  mutating the caller's object
- hands the resulting `Report` to a caller-installed **sink**

## Sink / adapter design

The package has **no Sentry / vendor dependency** and **no server-observability
dependency**. A real provider is installed later as a sink adapter:

```ts
import { createErrorReporter } from "@slotnova/observability-browser";

const reporter = createErrorReporter({
  release: __APP_VERSION__,
  environment: import.meta.env.MODE,
  sink: { send: (report) => myProviderAdapter.capture(report) },
  onReportFailure: () => {}, // provider outage must not break the app
});

reporter.reportError(err, { metadata: { view: "checkout" } });
```

### Failure containment contract

`reportError` and `reportMessage` **never throw and never reject**. A sink that
throws synchronously or returns a rejecting promise is caught and forwarded to
`onReportFailure` (default: no-op).

## Not in scope here

Real provider DSN / exporter wiring is a later env-config task (T072). Denylist
redaction of payload contents lives in `@slotnova/observability-server` and is
not duplicated into this browser seam — browser metadata is caller-supplied and
explicit, and cross-package sharing waits for the rule of three.

The `no-observability-server-in-browser` dependency-cruiser rule fails the build
if this package (or `apps/web` / `packages/ui`) imports
`@slotnova/observability-server`.
