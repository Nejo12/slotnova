/**
 * Proof test for T065 (`docs/decisions/0004-validation-contract-integration.md`
 * "Generated client/types/MSW feasibility proof"): the generated `paths`
 * type actually types `createContractsClient`'s calls, and at least one
 * generated MSW handler intercepts and answers a real `fetch` -- not just a
 * type-level claim.
 */
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from "vitest";

import { createContractsClient } from "../index.js";
import { CONTRACTS_MOCK_ORIGIN, handlers, http } from "../msw/index.js";
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

  it("includes the shared ProblemDetailsDto schema (PR-15 review fix: error responses are now part of the generated contract)", () => {
    // `components["schemas"]["ProblemDetailsDto"]` only exists in the
    // generated types because every Phase 1 controller's error
    // `@ApiResponse` decorator references it via `getSchemaPath` and the
    // OpenAPI document registers it (`extraModels`) -- this is a
    // compile-time proof, not a runtime string check, that this package's
    // generated output represents error responses, closing the gap the
    // review identified ("packages/contracts does not represent endpoint
    // error responses").
    expectTypeOf<components["schemas"]["ProblemDetailsDto"]>().not.toBeNever();
    expectTypeOf<components["schemas"]["ProblemDetailsDto"]>().toHaveProperty("type");
    expectTypeOf<components["schemas"]["ProblemDetailsDto"]>().toHaveProperty("title");
    expectTypeOf<components["schemas"]["ProblemDetailsDto"]>().toHaveProperty("status");
    // `requestId` is deliberately never part of this shape (see
    // `apps/api/src/http/problem/problem-details.schema.ts`'s doc comment) --
    // asserted here too so a future accidental addition on the API side is
    // caught from the consumer-package side as well.
    expectTypeOf<components["schemas"]["ProblemDetailsDto"]>().not.toHaveProperty("requestId");
  });

  it("intercepts a documented error status with a real ProblemDetailsDto-shaped body (runtime proof)", async () => {
    // Runtime companion to the compile-type check above: overrides the
    // default generated `/v1/me` handler (which only answers its lowest
    // documented 2xx) with its documented 401, using `openapi-msw`'s typed
    // `http.get` against the SAME generated `paths` type -- this only
    // compiles because the generated document's `/v1/me` GET operation
    // actually has a 401 response (it did not, before this task's fix).
    server.use(
      http.get("/v1/me", () =>
        HttpResponse.json(
          {
            type: "https://slotnova.app/problems/session-invalid",
            title: "The session is missing, expired, or revoked.",
            status: 401,
          } satisfies components["schemas"]["ProblemDetailsDto"],
          { status: 401 },
        ),
      ),
    );

    const client = createContractsClient({ baseUrl: BASE_URL });
    const { data, error, response } = await client.GET("/v1/me", {});
    expect(response.status).toBe(401);
    expect(data).toBeUndefined();
    expect(error).toEqual(
      expect.objectContaining({
        type: "https://slotnova.app/problems/session-invalid",
        status: 401,
      }),
    );
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
