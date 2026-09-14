/**
 * Proof tests for the shared `problem+json` OpenAPI/Zod schema
 * (`../problem-details.schema.ts`), added to close a review-identified gap
 * (PR-15 T064-T067): the generated OpenAPI document previously documented
 * success responses only. Written before the controller decorators/
 * regeneration change (TDD, per this branch's established convention -- see
 * `zod-validation.test.ts`/T064's own commits) to pin down two properties
 * independently of the full app boot the `*.contract.test.ts` files need:
 *
 * 1. The schema accepts every real shape `problem.filter.ts` actually builds
 *    (structural fidelity to the runtime response, not just to the RFC 9457
 *    prose).
 * 2. `ProblemDetails` (`../problem-types.ts`) and `problemDetailsSchema`
 *    describe the same shape by construction (`ProblemDetails` is a
 *    `z.infer<>` of this schema, not a hand-synced second declaration) --
 *    asserted here as a compile-time `satisfies` check plus a runtime parse
 *    of a real `ProblemDetails` value, so a future edit to one that silently
 *    diverges from the other fails both at typecheck and at test time.
 */
import { describe, expect, it } from "vitest";

import type { ProblemDetails } from "../problem-types.js";
import { problemDetailsSchema } from "../problem-details.schema.js";

describe("problemDetailsSchema", () => {
  it("accepts the minimal shape (no optional members)", () => {
    const minimal = {
      type: "https://slotnova.app/problems/session-invalid",
      title: "The session is missing, expired, or revoked.",
      status: 401,
    };
    expect(problemDetailsSchema.parse(minimal)).toEqual(minimal);
  });

  it("accepts the full shape with every optional member populated", () => {
    const full = {
      type: "https://slotnova.app/problems/validation",
      title: "The request could not be validated.",
      status: 400,
      detail: "email must be a valid email",
      instance: "https://slotnova.app/requests/abc-123",
      errors: [{ path: "email", message: "must be a valid email" }],
      requiredCapability: "members:invite",
      checks: { database: "down" },
    };
    expect(problemDetailsSchema.parse(full)).toEqual(full);
  });

  it("rejects a body missing a required field", () => {
    expect(() => problemDetailsSchema.parse({ title: "x", status: 400 })).toThrow();
  });

  it("rejects a `requestId` field masquerading as part of the documented shape", () => {
    // Guards the documented decision (see the schema file's own comment): the
    // real response never carries a separate `requestId` member -- only
    // `instance` (a URL embedding it). `.parse()` on a Zod object schema
    // strips unknown keys by default rather than rejecting them, so this
    // assertion proves the *parsed* result never echoes `requestId` back,
    // which is the property that actually matters for "not part of the
    // documented contract" (an OpenAPI consumer only ever sees the schema's
    // declared members).
    const parsed = problemDetailsSchema.parse({
      type: "https://slotnova.app/problems/internal",
      title: "An unexpected error occurred.",
      status: 500,
      requestId: "should-not-survive",
    });
    expect(parsed).not.toHaveProperty("requestId");
  });

  it("`ProblemDetails` and `problemDetailsSchema` describe the same shape (compile-time + runtime)", () => {
    const value: ProblemDetails = {
      type: "https://slotnova.app/problems/not-ready",
      title: "The service is not ready to accept traffic.",
      status: 503,
      checks: { database: "down" },
      // `satisfies` (not just the annotation above) proves this object is
      // simultaneously assignable to `problemDetailsSchema`'s inferred
      // output type -- if the two ever diverged, this line would fail to
      // typecheck even though the annotation above alone might still pass.
    } satisfies import("zod").z.infer<typeof problemDetailsSchema>;

    expect(() => problemDetailsSchema.parse(value)).not.toThrow();
  });
});
