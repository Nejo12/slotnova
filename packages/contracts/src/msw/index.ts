/**
 * `@slotnova/contracts/msw` -- thin typed-MSW-handler adapter (task T065,
 * `docs/decisions/0004-validation-contract-integration.md` "Generated
 * client/types/MSW feasibility proof").
 *
 * Static wrapper, not generated output: `http` is `openapi-msw`'s
 * `createOpenApiHttp<paths>()` instantiated against the generated `paths`
 * type (`../generated/types.ts`) -- the same typed factory a suite reaches
 * for when it wants a fully-typed handler for one endpoint
 * (`http.get("/v1/me", ...)`, etc).
 *
 * `handlers` (the array `@slotnova/testing/msw/handlers.ts` documents
 * consuming) is derived directly from the OpenAPI document's own operation
 * list (`../generated/openapi.json`, plain contract data, not a hand-authored
 * fixture): one default handler per documented `{path, method}`, answering
 * with that operation's lowest declared 2xx/3xx status and an empty JSON
 * body. This proves every documented operation is intercepted without
 * hand-writing per-endpoint response fixtures that would duplicate business
 * logic -- a suite that needs a realistic body overrides with
 * `server.use(...)` / `composeHandlers(contractHandlers, [...])`, per
 * `@slotnova/testing/msw`'s documented pattern.
 *
 * Handlers are registered against a fixed absolute test origin
 * (`CONTRACTS_MOCK_ORIGIN`), matching this repo's established MSW-fixture
 * convention (`https://api.slotnova.test`, already used by
 * `apps/web/src/health/__tests__/check-api-health.test.ts` and
 * `packages/testing/src/msw/__tests__/msw-node.test.ts`). MSW only resolves a
 * *relative* handler path against `location.href`, which does not exist in a
 * plain (non-jsdom) Node test run -- an absolute origin is therefore required
 * for these handlers to match under `packages/testing/src/msw/node.ts`
 * (`environment: "node"`), not merely a style choice.
 */
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";

import openapiDocument from "../generated/openapi.json" with { type: "json" };
import type { paths } from "../generated/types.js";

/** Fixed mock origin every generated handler below is registered against. */
export const CONTRACTS_MOCK_ORIGIN = "https://api.slotnova.test";

export const http = createOpenApiHttp<paths>({ baseUrl: CONTRACTS_MOCK_ORIGIN });

interface OpenApiOperation {
  readonly responses?: Readonly<Record<string, unknown>>;
}

type OpenApiPathItem = Readonly<Record<string, OpenApiOperation>>;

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;

function lowestSuccessStatus(operation: OpenApiOperation): number {
  const statuses = Object.keys(operation.responses ?? {})
    .map((status) => Number.parseInt(status, 10))
    .filter((status) => Number.isInteger(status) && status >= 200 && status < 400)
    .sort((a, b) => a - b);
  const [status] = statuses;
  return status ?? 200;
}

const paths = openapiDocument.paths as Readonly<Record<string, OpenApiPathItem>>;

export const handlers = Object.entries(paths).flatMap(([path, pathItem]) =>
  HTTP_METHODS.filter((method) => method in pathItem).map((method) => {
    const status = lowestSuccessStatus(pathItem[method] as OpenApiOperation);
    return http.untyped[method](`${CONTRACTS_MOCK_ORIGIN}${path}`, () =>
      status === 204 || status === 304
        ? new HttpResponse(null, { status })
        : HttpResponse.json({}, { status }),
    );
  }),
);
