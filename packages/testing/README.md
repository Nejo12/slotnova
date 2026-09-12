# `@slotnova/testing`

Test-support package for the platform foundation (tasks **T015–T018** of
`specs/001-platform-foundation-shell/tasks.md`, FR-047/FR-048/FR-049/FR-055,
ADR-006). Test code only — it carries **no** product domain model, **no**
database schema, **no** DB mock, and **no** vendor SDK.

## Entry points

| Import | Contains | Environment |
|---|---|---|
| `@slotnova/testing` | property-testing wiring, data builders, telemetry sink | isomorphic — safe in node and browser/component tests |
| `@slotnova/testing/property` | fast-check + shared fast-lane config | isomorphic |
| `@slotnova/testing/builders` | valid-by-default `workspace` / `user` / `membership` / `session` / `invitation` shapes | isomorphic |
| `@slotnova/testing/telemetry` | in-memory telemetry / domain-event sink + assertions | isomorphic |
| `@slotnova/testing/msw` | isomorphic MSW handler helpers (`http`, `HttpResponse`, `composeHandlers`) | isomorphic |
| `@slotnova/testing/msw/node` | `setupServer` harness + Vitest lifecycle | node only |
| `@slotnova/testing/msw/browser` | `setupWorker` for Storybook / dev | browser only |

The root entry pulls no node-only dependency; `msw/node` is never re-exported
from it, so a browser/component test can import `@slotnova/testing` freely.

## Property testing (T015)

`propertyParameters()` supplies the shared `fc.assert` configuration: a modest
default example count so property files stay cheap in the < 3-minute fast lane,
`SLOTNOVA_PROPERTY_SEED` / `SLOTNOVA_PROPERTY_RUNS` env overrides, and shrinking
left enabled so a failure reports a minimal counterexample plus the seed/path to
replay it. Conventions — including when a property must instead be a real
PostgreSQL test — are in
[`docs/testing/property-testing-conventions.md`](../../docs/testing/property-testing-conventions.md).

No Slotnova-specific arbitraries ship yet; they are added as new named exports of
`@slotnova/testing/property` (a non-breaking change) with the product phases they
belong to.

## MSW (T016)

MSW isolates the **HTTP contract** for component tests, Storybook edge states and
local dev fixtures.

> MSW is **never** evidence for database, RLS, constraint or transaction
> correctness. That is proven only against real PostgreSQL via
> `@slotnova/db/testing` (ADR-006, FR-048, `docs/testing/strategy.md` §4–§6).

Ordinary CI makes no real external-provider calls: the node harness defaults to
`onUnhandledRequest: "error"`, so an un-mocked request fails the test instead of
reaching the network.

`composeHandlers(base, ...overrides)` merges a shared handler set with per-suite
overrides. Once **T065** generates typed handlers into `packages/contracts`,
feature setups compose `@slotnova/contracts/msw` through the same helper — see the
doc comment in `src/msw/handlers.ts`. This package never writes product API
handlers itself.

The browser worker needs `mockServiceWorker.js` in the host's public directory:

```sh
pnpm --filter @slotnova/testing exec msw init <public-dir> --save
```

## Builders (T017)

Every `build*` function returns a **fresh** object (nested values included) on
each call, with deterministic defaults, and takes one optional override — a
shallow patch or a `(defaults) => value` function. There is no shared mutable
fixture state. `buildWorkspaceScenario()` composes the five builders into one
internally-consistent graph.

These are **test-data shapes**, not domain models or schemas, and there are no
product entities (booking / recovery / payment / service / staff).

## Telemetry (T018)

`createTelemetrySink()` is an in-memory buffer for asserting emitted
domain/telemetry events with no network, no hosted provider and no vendor SDK
(FR-055, ADR-024 §"Internal in-process domain events"). It keeps strict emission
order, and exposes `capture` (`emit`), `clear`, `find` / `first` / `count` /
`names`, and `assertEmitted` / `assertEmittedTimes` / `assertNotEmitted` with
diagnostic failure messages. It is not the audit trail (ADR-019) and does no
metrics aggregation. The sink implements a `{ emit(name, payload?) }` port so a
unit under test can depend on that shape directly.
