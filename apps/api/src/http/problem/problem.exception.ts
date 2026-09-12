import { HttpException } from "@nestjs/common";

import { PROBLEM_CATALOGUE } from "./problem-catalogue.js";
import type { ProblemSlug, ProblemValidationError } from "./problem-types.js";

export interface ProblemExceptionOptions {
  /** Overrides the catalogue's default `status` for this occurrence. */
  readonly status?: number;
  /** Safe, human-readable detail for this occurrence. Never a stack/SQL/secret. */
  readonly detail?: string;
  readonly errors?: readonly ProblemValidationError[];
  readonly requiredCapability?: string;
  readonly checks?: Readonly<Record<string, string>>;
}

/**
 * Throw this for any known failure class instead of a bare Nest
 * `HttpException` — it carries the stable `type` slug the
 * {@link import("./problem.filter.js").ProblemExceptionFilter} needs to build
 * a spec-compliant `problem+json` body (contracts/problem+json.contract.md).
 */
export class ProblemException extends HttpException {
  readonly slug: ProblemSlug;
  readonly problemOptions: ProblemExceptionOptions;

  constructor(slug: ProblemSlug, options: ProblemExceptionOptions = {}) {
    const status = options.status ?? PROBLEM_CATALOGUE[slug].status;
    super(PROBLEM_CATALOGUE[slug].title, status);
    this.slug = slug;
    this.problemOptions = options;
  }
}
