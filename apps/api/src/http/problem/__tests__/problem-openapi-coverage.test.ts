/**
 * Proof tests for the PR-15 review fix (T064-T067 follow-up,
 * `docs/decisions/0004-validation-contract-integration.md`): the generated
 * OpenAPI document previously documented success responses only for every
 * Phase 1 endpoint -- `paths["/v1/auth/session"].post.responses` had just a
 * `"200"` key, with no 400/401/403 -- so `packages/contracts` had no
 * representation of error responses and breaking-change detection could not
 * protect them.
 *
 * These tests read the COMMITTED generated document
 * (`apps/api/openapi/openapi.json`) directly, the same artifact
 * `openapi:generate` writes and `contracts:check` (T066) already proves is
 * never stale relative to current source -- so this is a real assertion
 * against the generated contract, not a re-derivation of what it "should"
 * say.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_DOCUMENT_PATH = resolve(__dirname, "../../../../openapi/openapi.json");

interface GeneratedResponse {
  content?: Record<string, { schema?: { $ref?: string } }>;
}
interface GeneratedOperation {
  responses?: Record<string, GeneratedResponse>;
}
interface GeneratedDocument {
  paths: Record<string, Record<string, GeneratedOperation>>;
  components?: { schemas?: Record<string, unknown> };
}

function loadDocument(): GeneratedDocument {
  return JSON.parse(readFileSync(OPENAPI_DOCUMENT_PATH, "utf8")) as GeneratedDocument;
}

/** Asserts `path`/`method` documents exactly `expectedStatuses` as `application/problem+json` referencing the shared schema. */
function expectProblemResponses(
  document: GeneratedDocument,
  path: string,
  method: string,
  expectedStatuses: readonly number[],
): void {
  const operation = document.paths[path]?.[method];
  expect(operation, `expected an operation for ${method.toUpperCase()} ${path}`).toBeDefined();

  for (const status of expectedStatuses) {
    const response = operation?.responses?.[String(status)];
    expect(
      response,
      `expected ${method.toUpperCase()} ${path} to document a "${status}" response`,
    ).toBeDefined();

    const ref = response?.content?.["application/problem+json"]?.schema?.$ref;
    expect(
      ref,
      `expected ${method.toUpperCase()} ${path}'s "${status}" response to be ` +
        `"application/problem+json" referencing the shared schema`,
    ).toBe("#/components/schemas/ProblemDetailsDto");
  }
}

describe("generated OpenAPI document -- problem+json error-response coverage", () => {
  it("registers the shared ProblemDetailsDto schema in components.schemas", () => {
    const document = loadDocument();
    expect(document.components?.schemas?.["ProblemDetailsDto"]).toBeDefined();
  });

  it("POST /v1/auth/session exposes its documented 400/401/403 problem responses", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/v1/auth/session", "post", [400, 401, 403]);
  });

  it("POST /v1/auth/session/workspace exposes its documented 400/401/403/409 problem responses", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/v1/auth/session/workspace", "post", [400, 401, 403, 409]);
  });

  it("GET /v1/me exposes its documented 401 problem response", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/v1/me", "get", [401]);
  });

  it("POST /v1/invitations (issue) exposes its documented 400/401/403/409 problem responses", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/v1/invitations", "post", [400, 401, 403, 409]);
  });

  it("GET /v1/invitations/{token} (preview) exposes its documented 404/410/429 problem responses", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/v1/invitations/{token}", "get", [404, 410, 429]);
  });

  it("POST /v1/invitations/{token}/acceptance (accept) exposes its documented 401/403/409/410 problem responses", () => {
    const document = loadDocument();
    expectProblemResponses(
      document,
      "/v1/invitations/{token}/acceptance",
      "post",
      [401, 403, 409, 410],
    );
  });

  it("PATCH /v1/invitations/{id} (revoke) exposes its documented 400/401/403/404 problem responses", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/v1/invitations/{id}", "patch", [400, 401, 403, 404]);
  });

  it("GET /readyz exposes its documented 503 problem response (and its 200 success response)", () => {
    const document = loadDocument();
    expectProblemResponses(document, "/readyz", "get", [503]);
    expect(document.paths["/readyz"]?.["get"]?.responses?.["200"]).toBeDefined();
  });
});
