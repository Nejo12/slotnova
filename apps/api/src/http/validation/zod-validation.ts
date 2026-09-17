/**
 * The API's HTTP-boundary Zod <-> `problem+json` wiring (T064,
 * `docs/decisions/0004-validation-contract-integration.md`).
 *
 * Originally `modules/identity/http/zod-validation.ts` when `identity` was
 * the only HTTP module. Relocated (verbatim — no behavior change) to
 * `apps/api/src/http/validation/` in Phase-2 PR-02, alongside the shared
 * `http/problem/` boundary it already depended on, because `catalog/http`
 * became its second consumer and `module-public-entry-only`
 * (`tooling/dependency-cruiser/.dependency-cruiser.cjs`) correctly forbids
 * one module reaching into another module's `http/` internals. This is the
 * API's HTTP boundary layer, not a `common/shared/utils` dumping ground:
 * it sits next to `http/problem` and `http/correlation`, which follow the
 * same convention.
 *
 * Per the decision record's resolved guidance (Risk 3 / "Implementation
 * follow-through"), this extends the existing `ProblemExceptionFilter`
 * (`apps/api/src/http/problem/problem.filter.ts`, left unmodified) rather
 * than adding a second parallel `@Catch()` filter: `createValidationException`
 * below builds a {@link ProblemException} from a Zod validation failure, and
 * since `ProblemException extends HttpException`, the existing filter's
 * `exception instanceof ProblemException` branch handles it with zero filter
 * changes.
 *
 * Per the spike's proof (0004, "Compatibility evidence"), the validation pipe
 * must be bound explicitly per-route (`@UsePipes(new ZodValidationPipe(Dto))`)
 * -- binding it globally silently no-ops. `ZodValidationPipe` here is this
 * module's pre-bound pipe *class* (via `createZodValidationPipe`, not the
 * package's default export, so it uses our `problem+json` mapping instead of
 * `nestjs-zod`'s own `ZodValidationException`).
 */
import type { PipeTransform } from "@nestjs/common";
import { createZodValidationPipe, type ZodDto } from "nestjs-zod";
import type { ZodError, ZodType } from "zod";

import { ProblemException } from "../problem/problem.exception.js";
import type { ProblemValidationError } from "../problem/problem-types.js";

/**
 * Maps a Zod validation failure into the exact `problem+json` `validation`
 * shape the hand-rolled parsers used to throw directly
 * (`contracts/problem+json.contract.md`: `errors: [{ path, message }]`). No
 * test in this module asserts on exact message text -- only on `status` and
 * `type` containing `/problems/validation` -- so this mapping has freedom in
 * wording as long as the shape holds.
 */
export function toValidationProblem(error: unknown): ProblemException {
  const issues = isZodError(error) ? error.issues : [];
  const errors: ProblemValidationError[] = issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
  return new ProblemException("validation", { errors });
}

function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

/**
 * This module's pre-bound Zod validation pipe class -- `new
 * ZodValidationPipe(SomeDto)` on a route validates `SomeDto`'s schema and
 * throws a {@link ProblemException} (via {@link toValidationProblem}) on
 * failure, so it flows through the existing global `ProblemExceptionFilter`
 * unchanged.
 *
 * Explicitly typed (rather than left inferred) because `nestjs-zod` does not
 * export its internal `UnknownSchema`/pipe-class types from the package
 * root -- an inferred type here is not nameable in the emitted `.d.ts` and
 * fails `tsc --declaration` (`apps/api`'s build output).
 */
type ZodValidationPipeCtor = new (schemaOrDto?: ZodType | ZodDto) => PipeTransform;

export const ZodValidationPipe: ZodValidationPipeCtor = createZodValidationPipe({
  createValidationException: toValidationProblem,
});
