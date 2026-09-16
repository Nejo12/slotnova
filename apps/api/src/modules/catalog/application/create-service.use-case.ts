/**
 * Service creation (FR-001). Validates domain invariants, then — only if a
 * category was supplied — re-resolves it under the *same* RLS-scoped
 * transaction to prove it belongs to the active workspace before the
 * `services` row is written (defense in depth ahead of the database
 * `services_category_workspace_fkey` constraint, ADR-008/ADR-011 pattern).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

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
    assertValidServiceCreateInput(input);

    return withWorkspaceContext(this.pool, context, async (tx) => {
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
    });
  }
}
