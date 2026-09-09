/**
 * `@slotnova/testing/msw` — isomorphic MSW handler helpers (task T016).
 *
 * MSW isolates the HTTP contract for component tests, Storybook edge states and
 * local dev fixtures. It is **never** evidence for database, RLS, constraint or
 * transaction correctness — that is proven only against real PostgreSQL via
 * `@slotnova/db/testing` (ADR-006, FR-048, `docs/testing/strategy.md` §4/§5).
 *
 * ## Consuming generated handlers (future, once T065 exists)
 *
 * T065 generates typed request handlers from the runtime API-boundary schemas
 * into `packages/contracts`. When that lands, feature test setups compose them:
 *
 * ```ts
 * import { handlers as contractHandlers } from "@slotnova/contracts/msw";
 * import { composeHandlers, http, HttpResponse } from "@slotnova/testing/msw";
 * import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
 *
 * const server = createMswServer(
 *   composeHandlers(contractHandlers, [
 *     http.get("/api/workspaces/:id", () => HttpResponse.json({ ... })),
 *   ]),
 * );
 * setupMswServerLifecycle(server);
 * ```
 *
 * This package never generates or hand-writes product API handlers itself.
 */

import type { RequestHandler } from "msw";

export { http, HttpResponse, passthrough } from "msw";
export type { HttpHandler, RequestHandler } from "msw";

/**
 * Merge a shared handler set with per-suite or per-test overrides. MSW resolves
 * handlers in registration order (first match wins), so overrides are placed
 * first. Later positional override groups win over earlier ones.
 */
export function composeHandlers(
  base: readonly RequestHandler[],
  ...overrideGroups: readonly (readonly RequestHandler[])[]
): RequestHandler[] {
  return [...overrideGroups.flat(), ...base];
}
