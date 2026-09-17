/**
 * Maps the failures Catalog's domain/application/platform layers raise onto
 * the API's existing `problem+json` catalogue
 * (`apps/api/src/http/problem/**`, `contracts/problem+json.contract.md`) —
 * PR-02, issue #60.
 *
 * Deliberately a thin translation over the canonical
 * {@link ProblemExceptionFilter}, not a second error-response format: it
 * rewrites only the exceptions it recognises into a {@link ProblemException}
 * and hands everything else to the existing filter untouched, so an
 * unrecognised throwable still becomes the generic `internal` 500 with the
 * real error logged server-side only. No PostgreSQL/Drizzle error text, SQL
 * fragment, table name, or id belonging to another workspace can reach a
 * response through here.
 *
 * Why a filter rather than `try`/`catch` in each handler: the mapping is the
 * same for all six endpoints, and putting it in one place makes it
 * impossible for a later Catalog route to forget a case and leak a raw 500
 * for a perfectly ordinary validation failure.
 */
import { Catch } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { ProblemExceptionFilter } from "../../../http/problem/problem.filter.js";
import { IdempotencyConflictError } from "../../platform/idempotency/idempotency-errors.js";
import { InvalidCurrencyError, InvalidMoneyAmountError } from "../domain/money.js";
import {
  InvalidServiceCategoryNameError,
  InvalidServiceCategorySortOrderError,
} from "../domain/service-category.js";
import {
  InvalidServiceBufferError,
  InvalidServiceDurationError,
  InvalidServiceNameError,
} from "../domain/service.js";
import {
  ServiceCategoryNotInWorkspaceError,
  ServiceNotFoundError,
} from "../infrastructure/repositories/services.repository.js";

/**
 * Domain-invariant violations are the `validation` problem at 422 — the
 * status `contracts/catalog.contract.md` specifies for "duration/price
 * invariants" — as opposed to the catalogue's 400 default, which stays
 * reserved for a request that is malformed at the schema level.
 */
const UNPROCESSABLE = 422;

function validationProblem(path: string, message: string): ProblemException {
  return new ProblemException("validation", {
    status: UNPROCESSABLE,
    errors: [{ path, message }],
  });
}

export function toCatalogProblem(exception: unknown): unknown {
  if (exception instanceof ServiceNotFoundError) {
    // Identical for "no such service" and "another workspace's service" —
    // the caller cannot tell a foreign id from a nonexistent one.
    return new ProblemException("not-found");
  }
  if (exception instanceof IdempotencyConflictError) {
    return new ProblemException("idempotency-conflict", {
      detail:
        "This Idempotency-Key was already used for a different request. Use a new key, or retry the original request unchanged.",
    });
  }
  if (exception instanceof ServiceCategoryNotInWorkspaceError) {
    // Non-leaking: a category that does not exist and a category owned by
    // another workspace produce the same message, with no id echoed back.
    return validationProblem("categoryId", "The referenced category is not available.");
  }
  if (exception instanceof InvalidServiceNameError) {
    return validationProblem("name", exception.message);
  }
  if (exception instanceof InvalidServiceDurationError) {
    return validationProblem("durationMinutes", exception.message);
  }
  if (exception instanceof InvalidServiceBufferError) {
    return validationProblem(exception.field, exception.message);
  }
  if (exception instanceof InvalidMoneyAmountError) {
    return validationProblem("priceAmountMinor", exception.message);
  }
  if (exception instanceof InvalidCurrencyError) {
    return validationProblem("priceCurrency", exception.message);
  }
  if (exception instanceof InvalidServiceCategoryNameError) {
    return validationProblem("name", exception.message);
  }
  if (exception instanceof InvalidServiceCategorySortOrderError) {
    return validationProblem("sortOrder", exception.message);
  }
  return exception;
}

@Catch()
export class CatalogProblemFilter extends ProblemExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(toCatalogProblem(exception), host);
  }
}
