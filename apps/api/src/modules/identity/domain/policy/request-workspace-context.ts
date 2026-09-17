/**
 * The server-resolved, authenticated workspace context that
 * {@link import("./capability.guard.js").CapabilityGuard} attaches to a
 * request once it has authorized that request (Phase-2 PR-02, issue #60).
 *
 * Why this exists: a capability-gated handler in another module (Catalog's
 * `services`/`categories` controllers) needs the active workspace id to run
 * its tenant-scoped work, and must never take it from client input. Before
 * PR-02 the only way to obtain it was to re-run the identity module's own
 * session resolution (`SessionService` + `SessionContextService`), which are
 * module-internal by design and correctly unreachable from another module
 * (`module-public-entry-only`, `tooling/dependency-cruiser/
 * .dependency-cruiser.cjs`). Rather than exporting those services — which
 * would let any module re-implement authentication its own way — the guard
 * that already resolved the context publishes exactly the two ids a gated
 * handler legitimately needs, and nothing else.
 *
 * Deliberately NOT a general request-scoped context container: it carries no
 * permissions list, no session record and no user projection, so a consumer
 * cannot make its own authorization decision from it. Authorization stays
 * exactly where it is — `authorize()` behind `@RequireCapability`.
 */
import type { FastifyRequest } from "fastify";

export interface RequestWorkspaceContext {
  readonly workspaceId: string;
  readonly userId: string;
}

/**
 * A symbol, not a string key: it cannot collide with a Fastify/plugin
 * property and cannot be set by anything that has not imported this module
 * (client input can never produce it).
 */
const REQUEST_WORKSPACE_CONTEXT = Symbol.for("slotnova.requestWorkspaceContext");

type ContextCarrier = { [REQUEST_WORKSPACE_CONTEXT]?: RequestWorkspaceContext };

/** Called only by `CapabilityGuard`, only after `authorize()` has passed. */
export function setRequestWorkspaceContext(
  request: FastifyRequest,
  context: RequestWorkspaceContext,
): void {
  (request as unknown as ContextCarrier)[REQUEST_WORKSPACE_CONTEXT] = context;
}

/**
 * `undefined` when the request was never gated by `CapabilityGuard`. A
 * handler that needs the context should be `@RequireCapability`-gated; a
 * caller reaching this with `undefined` is a wiring bug, not a client error,
 * so consumers throw their own fail-closed error rather than this module
 * inventing an HTTP mapping it has no business owning.
 */
export function getRequestWorkspaceContext(
  request: FastifyRequest,
): RequestWorkspaceContext | undefined {
  return (request as unknown as ContextCarrier)[REQUEST_WORKSPACE_CONTEXT];
}
