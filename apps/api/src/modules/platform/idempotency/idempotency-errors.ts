/**
 * Platform-level idempotency error (issue #61, correctness repair). A plain
 * `Error` subclass, not `HttpException`/`ProblemException` — this module
 * knows nothing about HTTP, Catalog, or any other consumer. The first HTTP
 * consumer (Catalog PR-02) maps it to `problem+json` at its own boundary.
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
