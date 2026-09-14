import type { LightMyRequestResponse } from "fastify";
import { z } from "zod";

import { problemTypeUrl, type ProblemSlug } from "../problem-types.js";

/**
 * Structural mirror of {@link import("../problem-types.js").ProblemDetails}
 * (T067, `contracts/problem+json.contract.md`) -- `problem-types.ts` itself
 * stays a plain TypeScript interface (T064 did not migrate it, and it is not
 * an HTTP request/response boundary schema in the `nestjs-zod` sense), so a
 * real-validation contract test needs its own runtime schema rather than
 * hand-picking a couple of fields. Kept local to the `problem` module rather
 * than added to `@slotnova/testing`: this is one small assertion helper for
 * `apps/api`'s own response shape, not a cross-package concern (rule of
 * three -- no shared package is justified for a single consumer app).
 */
const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  requiredCapability: z.string().optional(),
  checks: z.record(z.string(), z.string()).optional(),
});

export interface ExpectProblemJsonOptions {
  /** Expected HTTP status line -- must equal both the response status and the body's `status` member. */
  readonly status: number;
  /** Expected stable `type` slug (`contracts/problem+json.contract.md`'s catalogue) -- compared via {@link problemTypeUrl}, never hand-constructed. */
  readonly slug: ProblemSlug;
}

/**
 * Asserts a Fastify `inject()` response is a spec-compliant
 * `application/problem+json` body (RFC 9457) for the given failure class --
 * real structural validation against {@link problemDetailsSchema} (`.parse()`,
 * throws with a detailed Zod error on any shape drift), not a couple of
 * hand-picked field checks. Used by every `*.contract.test.ts` file (T067)
 * to cover "every forced error is valid `problem+json` with stable `type`"
 * once per documented failure mode, per the contract catalogue `.md` files.
 */
export function expectProblemJson(
  response: LightMyRequestResponse,
  options: ExpectProblemJsonOptions,
): void {
  if (response.statusCode !== options.status) {
    throw new Error(
      `expected HTTP status ${options.status} for problem slug "${options.slug}", got ${response.statusCode}: ${response.payload}`,
    );
  }

  const contentType = response.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.includes("application/problem+json")) {
    throw new Error(
      `expected Content-Type "application/problem+json", got "${String(contentType)}"`,
    );
  }

  const body = problemDetailsSchema.parse(response.json());

  const expectedType = problemTypeUrl(options.slug);
  if (body.type !== expectedType) {
    throw new Error(`expected problem "type" to be "${expectedType}", got "${body.type}"`);
  }
  if (body.status !== options.status) {
    throw new Error(`expected problem body "status" to be ${options.status}, got ${body.status}`);
  }
}
