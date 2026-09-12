import { generateCorrelationId, runWithContext } from "@slotnova/observability-server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Incoming request ids are accepted only through this trusted contract: the
 * `x-request-id` header, and only when it looks like an id (safe charset,
 * bounded length) rather than arbitrary attacker-controlled text that would
 * land in every structured log line for the request. Anything else is
 * replaced with a freshly generated id (FR-054).
 */
const TRUSTED_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function resolveIncomingRequestId(header: unknown): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return undefined;
  return TRUSTED_REQUEST_ID.test(value) ? value : undefined;
}

/**
 * Register the correlation-context hook on the raw Fastify instance
 * underlying the Nest app. Every request gets a correlation id — generated
 * if absent/untrusted, preserved if supplied and trusted — carried through
 * the whole request via `AsyncLocalStorage`
 * (`@slotnova/observability-server`), returned to the caller via the
 * `x-request-id` response header (FR-054).
 *
 * Uses the `(request, reply, done)` hook form deliberately: calling `done()`
 * from *inside* `runWithContext` is what lets Node's `AsyncLocalStorage`
 * propagate the context through the rest of the Fastify/Nest request
 * lifecycle (every hook, guard, interceptor and handler downstream runs
 * inside the async chain `done()` kicks off).
 */
export function registerCorrelationHook(instance: FastifyInstance): void {
  instance.addHook("onRequest", (request: FastifyRequest, reply: FastifyReply, done) => {
    const requestId =
      resolveIncomingRequestId(request.headers[REQUEST_ID_HEADER]) ?? generateCorrelationId();
    reply.header(REQUEST_ID_HEADER, requestId);
    runWithContext({ correlationId: requestId, requestId }, done);
  });
}
