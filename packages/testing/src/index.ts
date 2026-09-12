/**
 * `@slotnova/testing` — Slotnova's test-support package (tasks T015–T018).
 *
 * The root entry point is environment-agnostic: property-testing wiring,
 * valid-by-default data builders, and the in-memory telemetry sink. It pulls no
 * node-only dependency, so component/browser test setups can import it freely.
 *
 * The MSW harness is **not** re-exported here — it is node/browser-specific and
 * lives behind explicit subpaths so neither environment drags the other's
 * runtime in:
 *
 * - `@slotnova/testing/msw`         — isomorphic handler helpers
 * - `@slotnova/testing/msw/node`    — `setupServer` harness for node tests
 * - `@slotnova/testing/msw/browser` — `setupWorker` for Storybook / dev
 */

export * from "./property/index.js";
export * from "./builders/index.js";
export * from "./telemetry.js";
