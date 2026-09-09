/**
 * `@slotnova/testing/msw/browser` — MSW worker for Storybook / local dev (task T016).
 *
 * Browser-only entry point (pulls `msw/browser`). It is never re-exported from
 * the package root and never imported by node test code.
 *
 * The worker needs `mockServiceWorker.js` served from the host app's public
 * directory. Install it once per host:
 *
 * ```sh
 * pnpm --filter @slotnova/testing exec msw init <public-dir> --save
 * ```
 *
 * Storybook usage (once `packages/ui` exists):
 *
 * ```ts
 * import { createMswWorker } from "@slotnova/testing/msw/browser";
 * import { http, HttpResponse } from "@slotnova/testing/msw";
 *
 * export const worker = createMswWorker([
 *   http.get("/api/session", () => HttpResponse.json({ user: null })),
 * ]);
 * // in .storybook/preview: await worker.start({ onUnhandledRequest: "bypass" });
 * ```
 */

import { setupWorker, type SetupWorker } from "msw/browser";

import type { RequestHandler } from "msw";

export type MswBrowserWorker = SetupWorker;

/** Create an MSW browser worker seeded with `handlers`. Call `worker.start()` in
 * the host (Storybook preview, dev entry) — never from node tests. */
export function createMswWorker(handlers: readonly RequestHandler[] = []): MswBrowserWorker {
  return setupWorker(...handlers);
}
