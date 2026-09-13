import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import {
  createLogger,
  generateCorrelationId,
  getCorrelationId,
} from "@slotnova/observability-server";
import type { FastifyReply } from "fastify";

import { PROBLEM_CATALOGUE } from "./problem-catalogue.js";
import {
  problemTypeUrl,
  requestInstanceUrl,
  type ProblemDetails,
  type ProblemSlug,
} from "./problem-types.js";
import { ProblemException } from "./problem.exception.js";

const logger = createLogger();

/**
 * A conservative fallback from a bare HTTP status to a catalogue slug, for
 * exceptions Nest itself throws (routing 404s, framework-level 400s) that are
 * not a {@link ProblemException}. Deliberately small: real per-endpoint
 * slugs are the catalogue (contracts/problem+json.contract.md) — this is only
 * the safety net so no response ever leaves the shape of `problem+json`.
 */
const STATUS_FALLBACK_SLUG: Readonly<Record<number, ProblemSlug>> = {
  400: "validation",
  401: "session-invalid",
  403: "forbidden",
  404: "not-found",
  429: "rate-limited",
};

function slugForStatus(status: number): ProblemSlug {
  return STATUS_FALLBACK_SLUG[status] ?? "internal";
}

/**
 * Global `application/problem+json` exception filter (RFC 9457, FR-037,
 * contracts/problem+json.contract.md). Every error response — a deliberate
 * {@link ProblemException}, a bare Nest `HttpException`, or a wholly
 * unexpected thrown value — is normalized to this single shape. `detail`
 * never carries a stack trace, SQL text, or a secret; unhandled exceptions
 * always fall back to the generic `internal` slug, with the real error
 * logged server-side only.
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = getCorrelationId() ?? generateCorrelationId();
    const instance = requestInstanceUrl(requestId);

    const problem = this.toProblemDetails(exception, instance);

    if (!(exception instanceof HttpException) || problem.status >= 500) {
      logger.error("api.unhandled_exception", {
        message: exception instanceof Error ? exception.message : String(exception),
        meta: {
          requestId,
          status: problem.status,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
      });
    }

    reply.status(problem.status).header("content-type", "application/problem+json").send(problem);
  }

  private toProblemDetails(exception: unknown, instance: string): ProblemDetails {
    if (exception instanceof ProblemException) {
      const entry = PROBLEM_CATALOGUE[exception.slug];
      const options = exception.problemOptions;
      return {
        type: problemTypeUrl(exception.slug),
        title: entry.title,
        status: options.status ?? entry.status,
        ...(options.detail !== undefined ? { detail: options.detail } : {}),
        instance,
        ...(options.errors !== undefined ? { errors: options.errors } : {}),
        ...(options.requiredCapability !== undefined
          ? { requiredCapability: options.requiredCapability }
          : {}),
        ...(options.checks !== undefined ? { checks: options.checks } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const slug = slugForStatus(status);
      const entry = PROBLEM_CATALOGUE[slug];
      // A framework HttpException's own message is safe, developer-facing
      // text (e.g. "Cannot GET /nope") — never a leaked internal/stack value.
      const detail = status < 500 ? safeMessage(exception) : undefined;
      return {
        type: problemTypeUrl(slug),
        title: entry.title,
        status,
        ...(detail !== undefined ? { detail } : {}),
        instance,
      };
    }

    // Wholly unexpected (non-HttpException) throwable: generic 500, no leak.
    const entry = PROBLEM_CATALOGUE.internal;
    return {
      type: problemTypeUrl("internal"),
      title: entry.title,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      instance,
    };
  }
}

function safeMessage(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  if (typeof response === "string") return response;
  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response &&
    typeof (response as { message: unknown }).message === "string"
  ) {
    return (response as { message: string }).message;
  }
  return exception.message;
}
