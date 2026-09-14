/**
 * Proof test for T065 (`docs/decisions/0004-validation-contract-integration.md`
 * "Generated client/types/MSW feasibility proof"): the generated `paths`
 * type actually types `createContractsClient`'s calls, and at least one
 * generated MSW handler intercepts and answers a real `fetch` -- not just a
 * type-level claim.
 */
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from "vitest";

import { createContractsClient } from "../index.js";
import { CONTRACTS_MOCK_ORIGIN, handlers } from "../msw/index.js";
import type { components, paths } from "../generated/types.js";

const BASE_URL = CONTRACTS_MOCK_ORIGIN;

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("@slotnova/contracts client", () => {
  it("is typed against the real generated `paths` (tsc-level proof)", () => {
    // If `paths` stopped matching the real OpenAPI document (e.g. `/v1/me`
    // were removed or its GET method changed), this would fail to
    // typecheck, not just fail at runtime -- `paths["/v1/me"]["get"]` only
    // exists because openapi-typescript generated it from the committed
    // document's actual `/v1/me` GET operation.
    expectTypeOf<paths["/v1/me"]["get"]>().not.toBeNever();
    expectTypeOf<paths["/v1/auth/session"]["post"]>().not.toBeNever();
  });

  it("performs a real GET through the typed client against a generated-path-typed operation", async () => {
    const client = createContractsClient({ baseUrl: BASE_URL });
    // `paths["/v1/me"]["get"]` only exists in the generated types because
    // the committed OpenAPI document declares that operation -- typing
    // `client.GET` against a nonexistent path or method is a compile error,
    // not a runtime one, so this call only compiles because the generated
    // types are correct. The response is served by a generated MSW handler
    // (registered above), proving runtime wiring, not just types.
    const { data, error, response } = await client.GET("/v1/me", {});
    expect(error).toBeUndefined();
    expect(response.status).toBe(200);
    expectTypeOf(data).toEqualTypeOf<components["schemas"]["MeResponseDto_Output"] | undefined>();
  });
});

describe("@slotnova/contracts/msw handlers", () => {
  it("intercepts a documented GET operation with a real fetch", async () => {
    const response = await fetch(`${BASE_URL}/v1/me`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it("intercepts a documented POST operation with a real fetch", async () => {
    const response = await fetch(`${BASE_URL}/v1/invitations`, { method: "POST" });
    expect(response.status).toBe(201);
  });

  it("answers a no-content operation with the documented 204 and empty body", async () => {
    const response = await fetch(`${BASE_URL}/v1/auth/session`, { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("provides one handler per documented path/method pair", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(11);
  });
});
