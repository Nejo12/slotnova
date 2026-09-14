/**
 * Fixture tests for the T066 breaking-change detector
 * (`../detect-breaking-changes.ts`, `docs/decisions/0004-validation-contract-integration.md`,
 * `specs/001-platform-foundation-shell/tasks.md` T066).
 *
 * TDD per this task's instructions: these fixtures are small synthetic
 * OpenAPI 3.0 documents (not the real committed document) so each breaking
 * pattern can be isolated and asserted independently, per T066's own "Tests"
 * line: "fixture -- hand-edit a generated file -> CI fails; a breaking
 * change -> flagged". This file covers the second half (breaking-change
 * detection); the first half (drift) is proven by `check-drift.sh` and
 * verified manually per the task's verification steps, not unit-tested here
 * -- it is a thin `git diff --exit-code` wrapper with no branching logic to
 * unit test.
 */
import { describe, expect, it } from "vitest";

import { detectBreakingChanges, type OpenApiDocument } from "../detect-breaking-changes.js";

/** Minimal valid OpenAPI 3.0 document, extended per-test via `structuredClone` + overrides. */
function baseDocument(): OpenApiDocument {
  return {
    openapi: "3.0.0",
    info: { title: "Slotnova API", version: "0.0.0" },
    paths: {
      "/v1/me": {
        get: {
          operationId: "MeController_me",
          responses: {
            "200": {
              description: "",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MeResponseDto" },
                },
              },
            },
          },
        },
      },
      "/v1/auth/session": {
        post: {
          operationId: "SessionController_signIn",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignInRequestDto" },
              },
            },
          },
          responses: {
            "200": {
              description: "",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SignInResponseDto" },
                },
              },
            },
          },
        },
        delete: {
          operationId: "SessionController_signOut",
          responses: { "204": { description: "" } },
        },
      },
    },
    components: {
      schemas: {
        MeResponseDto: {
          type: "object",
          properties: {
            id: { type: "string" },
            displayName: { type: "string" },
          },
          required: ["id", "displayName"],
        },
        SignInRequestDto: {
          type: "object",
          properties: {
            credential: { type: "object" },
            rememberMe: { type: "boolean" },
          },
          required: ["credential"],
        },
        SignInResponseDto: {
          type: "object",
          properties: {
            user: { type: "object" },
          },
          required: ["user"],
        },
      },
    },
  };
}

describe("detectBreakingChanges", () => {
  it("returns no findings when comparing a document against itself", () => {
    const doc = baseDocument();
    expect(detectBreakingChanges(doc, doc)).toEqual([]);
  });

  it("flags a removed path", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    delete newDoc.paths["/v1/me"];

    const findings = detectBreakingChanges(oldDoc, newDoc);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: "path-removed", path: "/v1/me" }),
    );
  });

  it("flags a removed operation (method) on a still-present path", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    delete newDoc.paths["/v1/auth/session"]?.delete;

    const findings = detectBreakingChanges(oldDoc, newDoc);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "operation-removed",
        path: "/v1/auth/session",
        method: "delete",
      }),
    );
  });

  it("flags a previously-required request body field being removed", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const schema = newDoc.components?.schemas?.["SignInRequestDto"];
    if (schema && "properties" in schema && schema.properties) {
      delete schema.properties["credential"];
      schema.required = (schema.required ?? []).filter((field) => field !== "credential");
    }

    const findings = detectBreakingChanges(oldDoc, newDoc);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "required-field-removed",
        schema: "SignInRequestDto",
        field: "credential",
      }),
    );
  });

  it("flags a previously-optional request body field becoming newly required", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const schema = newDoc.components?.schemas?.["SignInRequestDto"];
    if (schema && "required" in schema) {
      schema.required = ["credential", "rememberMe"];
    }

    const findings = detectBreakingChanges(oldDoc, newDoc);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "field-newly-required",
        schema: "SignInRequestDto",
        field: "rememberMe",
      }),
    );
  });

  it("flags a previously-guaranteed response field being removed", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const schema = newDoc.components?.schemas?.["MeResponseDto"];
    if (schema && "properties" in schema && schema.properties) {
      delete schema.properties["displayName"];
      schema.required = (schema.required ?? []).filter((field) => field !== "displayName");
    }

    const findings = detectBreakingChanges(oldDoc, newDoc);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "required-field-removed",
        schema: "MeResponseDto",
        field: "displayName",
      }),
    );
  });

  it("flags a response schema field's type narrowing incompatibly", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const schema = newDoc.components?.schemas?.["MeResponseDto"];
    if (schema && "properties" in schema && schema.properties) {
      schema.properties["id"] = { type: "integer" };
    }

    const findings = detectBreakingChanges(oldDoc, newDoc);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "field-type-changed",
        schema: "MeResponseDto",
        field: "id",
        from: "string",
        to: "integer",
      }),
    );
  });

  it("does NOT flag a new path (additive)", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    newDoc.paths["/v1/workspaces"] = {
      get: { operationId: "WorkspacesController_list", responses: { "200": { description: "" } } },
    };

    expect(detectBreakingChanges(oldDoc, newDoc)).toEqual([]);
  });

  it("does NOT flag a new operation on an existing path (additive)", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const path = newDoc.paths["/v1/me"];
    if (path) {
      path.patch = {
        operationId: "MeController_update",
        responses: { "200": { description: "" } },
      };
    }

    expect(detectBreakingChanges(oldDoc, newDoc)).toEqual([]);
  });

  it("does NOT flag a new optional request field (additive)", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const schema = newDoc.components?.schemas?.["SignInRequestDto"];
    if (schema && "properties" in schema && schema.properties) {
      schema.properties["deviceLabel"] = { type: "string" };
    }

    expect(detectBreakingChanges(oldDoc, newDoc)).toEqual([]);
  });

  it("does NOT flag a previously-required field becoming optional (loosening, not breaking)", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    const schema = newDoc.components?.schemas?.["MeResponseDto"];
    if (schema && "required" in schema) {
      schema.required = ["id"];
    }

    expect(detectBreakingChanges(oldDoc, newDoc)).toEqual([]);
  });

  it("does NOT flag a new response schema (additive)", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    if (newDoc.components?.schemas) {
      newDoc.components.schemas["NewDto"] = { type: "object", properties: {} };
    }

    expect(detectBreakingChanges(oldDoc, newDoc)).toEqual([]);
  });

  it("produces deterministically ordered findings across repeated calls", () => {
    const oldDoc = baseDocument();
    const newDoc = baseDocument();
    delete newDoc.paths["/v1/me"];
    delete newDoc.paths["/v1/auth/session"]?.delete;
    const schema = newDoc.components?.schemas?.["SignInRequestDto"];
    if (schema && "properties" in schema && schema.properties) {
      delete schema.properties["credential"];
      schema.required = (schema.required ?? []).filter((field) => field !== "credential");
    }

    const first = detectBreakingChanges(oldDoc, newDoc);
    const second = detectBreakingChanges(oldDoc, newDoc);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
  });
});
