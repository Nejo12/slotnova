/**
 * `POST /catalog/services`'s `Idempotency-Key` contract
 * (`contracts/catalog.contract.md`: "a retried request with the same key
 * returns the original `201` body, not a duplicate").
 *
 * ## The transaction contract this exists to hold
 *
 * `platform/idempotency/executeIdempotently` supports exactly one shape:
 * the claim, the protected write, and the stored replay response all commit
 * inside ONE PostgreSQL transaction (see that module's header — a
 * split-transaction variant existed, was found unsafe by review, and was
 * removed). This use case is the single place that composes the two:
 * `withWorkspaceContext` opens the transaction (and sets the RLS tenant
 * context), and `executeIdempotently` runs the Service creation inside it.
 *
 * Consequences that are the whole point, and must not be "optimized" away:
 * - a duplicate key can never produce a second `services` row, because a
 *   claim that loses the unique-index race never runs `fn` at all;
 * - a failed creation rolls the claim back with it, because they are the
 *   same transaction — a client that retries after a failure is not
 *   permanently locked out by a poisoned key;
 * - `catalog` never gets its own idempotency table (PR-02 adds no
 *   migration); it consumes `public.idempotent_requests` from PR-02A.
 *
 * ## Why the response body is rendered by the caller
 *
 * The replayed body has to be byte-identical to the original, so the exact
 * HTTP response body is what gets persisted. Rather than teach this
 * application service the HTTP response shape, the controller passes a
 * `render` callback: this file stays free of status codes and DTO shapes,
 * and there is still exactly one representation of the body (the
 * controller's), never a second one written just for replay.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  executeIdempotently,
  type ExecuteIdempotentlyResult,
  type StoredResponse,
} from "../../platform/idempotency/idempotent-execution.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import type { ServiceCreateInput } from "../domain/service.js";
import type { ServiceRecord } from "../infrastructure/repositories/services.repository.js";
import { CreateServiceUseCase } from "./create-service.use-case.js";

/**
 * The stable operation scope for this endpoint. Idempotency uniqueness is
 * `(workspace_id, operation, idempotency_key)`, so this constant is what
 * keeps the same key independent across endpoints — and, because
 * `workspace_id` is part of the key, independent across workspaces too.
 */
export const CREATE_SERVICE_OPERATION = "catalog.create_service";

export interface IdempotentServiceCreation {
  readonly idempotencyKey: string;
  /** Digest of the request payload AFTER runtime-schema parsing/normalization. */
  readonly requestFingerprint: string;
}

@Injectable()
export class CreateServiceIdempotentlyUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly createService: CreateServiceUseCase,
  ) {}

  async execute(
    context: WorkspaceContext,
    input: ServiceCreateInput,
    idempotency: IdempotentServiceCreation,
    render: (service: ServiceRecord) => StoredResponse,
  ): Promise<ExecuteIdempotentlyResult> {
    return withWorkspaceContext(this.pool, context, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: context.workspaceId,
          operation: CREATE_SERVICE_OPERATION,
          idempotencyKey: idempotency.idempotencyKey,
          requestFingerprint: idempotency.requestFingerprint,
        },
        async () => render(await this.createService.executeInTransaction(tx, context, input)),
      ),
    );
  }
}
