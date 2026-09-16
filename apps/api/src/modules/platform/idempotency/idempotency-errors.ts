/**
 * Platform-level idempotency errors (issue #61). Deliberately plain `Error`
 * subclasses, not `HttpException`/`ProblemException` — this module knows
 * nothing about HTTP, Catalog, or any other consumer. The first HTTP
 * consumer (Catalog PR-02) maps these to `problem+json` at its own boundary.
 */
export class IdempotencyConflictError extends Error {
  override readonly name = "IdempotencyConflictError";
  constructor(
    readonly operation: string,
    readonly idempotencyKey: string,
  ) {
    super(
      `idempotency key "${idempotencyKey}" for operation "${operation}" was already used with a different request`,
    );
  }
}

/**
 * The key is claimed by another still-live execution (its lease has not
 * expired). This is a genuine concurrent duplicate, not a replay — the
 * caller must not run its business logic a second time.
 */
export class IdempotencyInProgressError extends Error {
  override readonly name = "IdempotencyInProgressError";
  constructor(
    readonly operation: string,
    readonly idempotencyKey: string,
  ) {
    super(
      `idempotency key "${idempotencyKey}" for operation "${operation}" is already being executed`,
    );
  }
}
