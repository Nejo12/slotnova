/**
 * Correlation / request context carried through server and worker execution
 * (FR-054). Backed by `AsyncLocalStorage` so a value set at the start of a
 * request or job is visible to every synchronous and awaited async descendant,
 * stays isolated between concurrent flows, and never leaks once the flow ends.
 *
 * This module is a seam only. NestJS middleware / interceptor wiring and worker
 * job-context propagation are PR-05 and later; nothing here assumes a framework.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Fields understood by the logger and future tracing adapters. All but
 * `correlationId` are optional and only present when a caller supplies them.
 */
export interface CorrelationContext {
  /** Stable id tying every log line of one request/job together. */
  readonly correlationId: string;
  /** Transport-level request id when distinct from the correlation id. */
  readonly requestId?: string;
  /** Distributed-trace id when a trace context is in play. */
  readonly traceId?: string;
  /** Active workspace/tenant, when the flow is workspace-scoped. */
  readonly workspaceId?: string;
  /** Acting user, when the flow is authenticated. */
  readonly userId?: string;
}

/**
 * Loose input shape for building a context: every field optional and allowed to
 * be `undefined` (values often arrive from request headers or job payloads).
 */
export type CorrelationContextInput = {
  readonly [K in keyof CorrelationContext]?: CorrelationContext[K] | undefined;
};

const storage = new AsyncLocalStorage<CorrelationContext>();

const KNOWN_FIELDS = ["correlationId", "requestId", "traceId", "workspaceId", "userId"] as const;

/** Generate a fresh correlation id (RFC 4122 v4). */
export const generateCorrelationId = (): string => randomUUID();

/**
 * Build a {@link CorrelationContext} from a partial input, generating a
 * `correlationId` when none is supplied and dropping keys whose value is
 * `undefined` (so the record stays clean for structured logging).
 */
export function createCorrelationContext(
  partial: CorrelationContextInput = {},
): CorrelationContext {
  const out: Record<string, string> = {};
  for (const field of KNOWN_FIELDS) {
    const value = partial[field];
    if (typeof value === "string") out[field] = value;
  }
  if (out["correlationId"] === undefined) out["correlationId"] = generateCorrelationId();
  return out as unknown as CorrelationContext;
}

/** Run `fn` with `context` (normalized) as the active correlation context. */
export function runWithContext<T>(context: CorrelationContextInput, fn: () => T): T {
  return storage.run(createCorrelationContext(context), fn);
}

/**
 * Run `fn` with the current context merged with `overrides` — the shape used to
 * carry correlation into background work triggered by a request. Falls back to a
 * fresh context when there is no active parent.
 */
export function runWithChildContext<T>(overrides: CorrelationContextInput, fn: () => T): T {
  const parent = storage.getStore();
  return storage.run(createCorrelationContext({ ...parent, ...overrides }), fn);
}

/** The active correlation context, or `undefined` outside any `runWith*` scope. */
export const getContext = (): CorrelationContext | undefined => storage.getStore();

/** The active correlation id, or `undefined` outside any `runWith*` scope. */
export const getCorrelationId = (): string | undefined => storage.getStore()?.correlationId;
