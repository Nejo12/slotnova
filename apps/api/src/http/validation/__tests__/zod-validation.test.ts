import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ProblemException } from "../../problem/problem.exception.js";
import { toValidationProblem } from "../zod-validation.js";

/**
 * T064 -- unit coverage for the Zod -> `problem+json` mapping used by
 * `ZodValidationPipe`'s `createValidationException` option
 * (`docs/decisions/0004-validation-contract-integration.md`). No existing
 * integration test exercises this function directly (they only assert on
 * HTTP status/`type`), so it gets focused coverage of its own.
 */
describe("toValidationProblem", () => {
  it("maps a ZodError's issues into problem+json validation errors[]", () => {
    const schema = z.object({ workspaceId: z.string().uuid() });
    const result = schema.safeParse({ workspaceId: "not-a-uuid" });
    expect(result.success).toBe(false);

    const problem = toValidationProblem(result.error);

    expect(problem).toBeInstanceOf(ProblemException);
    expect(problem.slug).toBe("validation");
    expect(problem.problemOptions.errors).toBeDefined();
    expect(problem.problemOptions.errors).toHaveLength(1);
    expect(problem.problemOptions.errors?.[0]).toMatchObject({ path: "workspaceId" });
    expect(typeof problem.problemOptions.errors?.[0]?.message).toBe("string");
  });

  it("joins nested paths with '.'", () => {
    const schema = z.object({ credential: z.object({ token: z.string() }) });
    const result = schema.safeParse({ credential: { token: 123 } });
    expect(result.success).toBe(false);

    const problem = toValidationProblem(result.error);

    expect(problem.problemOptions.errors?.[0]).toMatchObject({ path: "credential.token" });
  });

  it("produces an empty errors[] for a non-ZodError input rather than throwing", () => {
    const problem = toValidationProblem(new Error("not a zod error"));
    expect(problem.slug).toBe("validation");
    expect(problem.problemOptions.errors).toEqual([]);
  });

  it("results in HTTP 400 via the ProblemException status", () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);

    const problem = toValidationProblem(result.error);
    expect(problem.getStatus()).toBe(400);
  });
});
