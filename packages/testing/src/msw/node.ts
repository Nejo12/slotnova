/**
 * `@slotnova/testing/msw/node` — MSW server for node test runs (task T016).
 *
 * Node-only entry point: it pulls `msw/node` and is never re-exported from the
 * package root, so a browser bundle can import `@slotnova/testing` without
 * dragging node internals in. `setupMswServerLifecycle` also imports `vitest`
 * (a peer dependency) — this module is only ever loaded from a test run.
 */

import { setupServer, type SetupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

import type { RequestHandler } from "msw";

export type MswTestServer = SetupServer;

/** How an unhandled request is treated. Defaults to `"error"` everywhere in this
 * package so an un-mocked call is a hard failure, never a silent real request. */
export type OnUnhandledRequest = "error" | "warn" | "bypass";

/**
 * Create an MSW server seeded with `handlers`. Call `.listen()` / `.close()`
 * yourself, or hand it to {@link setupMswServerLifecycle}.
 */
export function createMswServer(handlers: readonly RequestHandler[] = []): MswTestServer {
  return setupServer(...handlers);
}

export interface MswServerLifecycleOptions {
  readonly onUnhandledRequest?: OnUnhandledRequest;
}

/**
 * Wire an MSW server into the surrounding Vitest suite:
 * - `beforeAll`  → `server.listen({ onUnhandledRequest: "error" })`
 * - `afterEach`  → `server.resetHandlers()` (drops per-test `server.use(...)` overrides)
 * - `afterAll`   → `server.close()`
 *
 * The `afterEach` reset is what stops one test's overrides leaking into the
 * next.
 */
export function setupMswServerLifecycle(
  server: MswTestServer,
  options: MswServerLifecycleOptions = {},
): void {
  const onUnhandledRequest: OnUnhandledRequest = options.onUnhandledRequest ?? "error";

  beforeAll(() => {
    server.listen({ onUnhandledRequest });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
}
