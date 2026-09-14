/**
 * Proof that `@slotnova/contracts/msw` (task T065) is consumable exactly the
 * way this package's own `handlers.ts` doc comment ("Consuming generated
 * handlers") documents it -- the same import lines, composed with
 * `composeHandlers` and run through this package's node MSW lifecycle
 * helper. This is a focused addition, not a modification of the existing
 * `msw-node.test.ts` suite.
 */
import { describe, expect, it } from "vitest";

import { CONTRACTS_MOCK_ORIGIN, handlers as contractHandlers } from "@slotnova/contracts/msw";
import { composeHandlers, http, HttpResponse } from "../handlers.js";
import { createMswServer, setupMswServerLifecycle } from "../node.js";

const API_BASE_URL = CONTRACTS_MOCK_ORIGIN;

const server = createMswServer(
  composeHandlers(contractHandlers, [
    http.get(`${API_BASE_URL}/v1/me`, () => HttpResponse.json({ overridden: true })),
  ]),
);
setupMswServerLifecycle(server, { onUnhandledRequest: "error" });

describe("@slotnova/contracts/msw consumed via @slotnova/testing/msw", () => {
  it("lets a suite-local override win over a generated contract handler", async () => {
    const response = await fetch(`${API_BASE_URL}/v1/me`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ overridden: true });
  });

  it("falls through to a generated contract handler for an endpoint with no override", async () => {
    const response = await fetch(`${API_BASE_URL}/v1/auth/csrf`);
    expect(response.status).toBe(200);
  });
});
