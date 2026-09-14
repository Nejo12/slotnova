import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LightMyRequestResponse } from "fastify";

import { problemDetailsSchema } from "../problem-details.schema.js";
import { problemTypeUrl, type ProblemSlug } from "../problem-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_DOCUMENT_PATH = resolve(__dirname, "../../../../openapi/openapi.json");

interface GeneratedOpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      { responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> }
    >
  >;
}

let cachedDocument: GeneratedOpenApiDocument | undefined;

/**
 * Lazily loads and caches the committed generated OpenAPI document
 * (`apps/api/openapi/openapi.json`, T064's `openapi:generate` output).
 * `contracts:check` (T066) already proves this committed file matches what
 * `openapi:generate` would produce from current source right now -- so
 * reading it here (rather than re-running Nest/Swagger document generation
 * inside every contract test) is reading the real generated contract, not a
 * copy.
 */
function loadGeneratedDocument(): GeneratedOpenApiDocument {
  cachedDocument ??= JSON.parse(
    readFileSync(OPENAPI_DOCUMENT_PATH, "utf8"),
  ) as GeneratedOpenApiDocument;
  return cachedDocument;
}

/**
 * `problemDetailsSchema` (`../problem-details.schema.ts`) is imported here
 * directly rather than hand-mirrored, per the PR-15 review fix (T064-T067
 * follow-up): this file previously declared its own structurally-equivalent
 * local schema, which meant `expectProblemJson` validated every forced-error
 * test against a hand-written shape, not the shape actually published in the
 * generated OpenAPI document. It is now the exact same schema every
 * controller's error `@ApiResponse` references via `getSchemaPath` -- so a
 * `.parse()` here is proof against the GENERATED contract, not a separate
 * hand-maintained approximation of it. Kept local to the `problem` module
 * rather than added to `@slotnova/testing`: this is one small assertion
 * helper for `apps/api`'s own response shape, not a cross-package concern
 * (rule of three -- no shared package is justified for a single consumer
 * app).
 */
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

export interface ExpectGeneratedProblemResponseOptions {
  /** The OpenAPI path template exactly as `@nestjs/swagger` emits it, e.g. `"/v1/auth/session"` or `"/v1/invitations/{token}"`. */
  readonly path: string;
  readonly method: "get" | "post" | "put" | "patch" | "delete";
  readonly status: number;
}

/**
 * The T064-T067 review-fix's "second assertion" (PR-15 follow-up): proves a
 * real HTTP response matches what the GENERATED OpenAPI document declares
 * for that exact `path`/`method`/`status` -- not only that it satisfies the
 * shared Zod schema in isolation (`expectProblemJson` above already does
 * that), but that the committed, generated document actually documents this
 * exact response as `application/problem+json` referencing
 * `ProblemDetailsDto`, AND that the live body validates against that same
 * schema. `expectProblemJson`'s existing structural check remains -- callers
 * add this as an additional assertion alongside it, per this task's own
 * instruction that the hand-written helper "may remain for convenience, but
 * cannot be the only proof."
 *
 * Reads `apps/api/openapi/openapi.json` directly (see
 * {@link loadGeneratedDocument}) rather than re-deriving expectations from
 * `problemDetailsSchema`/`problem-catalogue.ts` a second time -- the whole
 * point is to assert against the artifact `openapi:generate` actually wrote,
 * the same artifact `packages/contracts` consumes and the breaking-change
 * detector diffs.
 */
export function expectGeneratedProblemResponse(
  response: LightMyRequestResponse,
  options: ExpectGeneratedProblemResponseOptions,
): void {
  const document = loadGeneratedDocument();
  const operation = document.paths[options.path]?.[options.method];
  if (!operation) {
    throw new Error(
      `generated OpenAPI document has no operation for ${options.method.toUpperCase()} ${options.path}`,
    );
  }

  const statusKey = String(options.status);
  const documentedResponse = operation.responses?.[statusKey];
  if (!documentedResponse) {
    throw new Error(
      `generated OpenAPI document has no "${statusKey}" response documented for ` +
        `${options.method.toUpperCase()} ${options.path} -- the controller's ` +
        "@ApiResponse decorator for this status is missing or was not regenerated " +
        "(run `pnpm --filter @slotnova/api openapi:generate`)",
    );
  }

  const problemContent = documentedResponse.content?.["application/problem+json"];
  const ref = problemContent?.schema?.$ref;
  if (ref !== "#/components/schemas/ProblemDetailsDto") {
    throw new Error(
      `expected the generated "${statusKey}" response for ${options.method.toUpperCase()} ` +
        `${options.path} to be "application/problem+json" referencing ` +
        `"#/components/schemas/ProblemDetailsDto", got: ${JSON.stringify(documentedResponse)}`,
    );
  }

  // The generated document's response schema IS `problemDetailsSchema`
  // (that is what every controller's decorator references) -- parsing the
  // live body against it here proves this exact response matches the
  // generated contract, not just "some problem+json shape".
  problemDetailsSchema.parse(response.json());
}
