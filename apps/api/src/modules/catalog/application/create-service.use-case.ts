/**
 * Service creation (FR-001). Validates domain invariants, then — only if a
 * category was supplied — re-resolves it under the *same* RLS-scoped
 * transaction to prove it belongs to the active workspace before the
 * `services` row is written (defense in depth ahead of the database
 * `services_category_workspace_fkey` constraint, ADR-008/ADR-011 pattern).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "@slotnova/db";

import { asWorkspaceId } from "../../identity/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { assertValidServiceCreateInput, type ServiceCreateInput } from "../domain/service.js";
import { ServiceCategoriesRepository } from "../infrastructure/repositories/service-categories.repository.js";
import {
  ServicesRepository,
  type ServiceRecord,
} from "../infrastructure/repositories/services.repository.js";

@Injectable()
export class CreateServiceUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly services: ServicesRepository,
    private readonly categories: ServiceCategoriesRepository,
  ) {}

  async execute(context: WorkspaceContext, input: ServiceCreateInput): Promise<ServiceRecord> {
    return withWorkspaceContext(this.pool, context, (tx) =>
      this.executeInTransaction(tx, context, input),
    );
  }

  /**
   * The same creation, run on a transaction the caller already owns.
   * Extracted in PR-02 so `CreateServiceIdempotentlyUseCase` can place the
   * idempotency claim, this write, and the stored replay response in ONE
   * transaction — the mandatory contract of
   * `platform/idempotency/executeIdempotently` — instead of duplicating the
   * creation logic. `execute` above is unchanged behaviorally: it simply
   * opens the transaction itself and delegates here.
   */
  async executeInTransaction(
    tx: PoolClient,
    context: WorkspaceContext,
    input: ServiceCreateInput,
  ): Promise<ServiceRecord> {
    assertValidServiceCreateInput(input);

    if (input.categoryId !== undefined) {
      const category = await this.categories.findById(tx, input.categoryId);
      this.services.assertCategoryResolved(input.categoryId, category);
    }

    return this.services.create(tx, {
      workspaceId: asWorkspaceId(context.workspaceId),
      categoryId: input.categoryId ?? null,
      name: input.name,
      durationMinutes: input.durationMinutes,
      preBufferMinutes: input.preBufferMinutes ?? 0,
      postBufferMinutes: input.postBufferMinutes ?? 0,
      price: input.price,
    });
  }
}
