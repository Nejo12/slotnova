/**
 * Service update (FR-001). `active` is an ordinary field here — issue #58:
 * reactivation is not a separate lifecycle framework, just setting
 * `active: true` through this same path.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { assertValidServiceUpdateInput, type ServiceUpdateInput } from "../domain/service.js";
import type { ServiceId } from "../domain/ids.js";
import { ServiceCategoriesRepository } from "../infrastructure/repositories/service-categories.repository.js";
import {
  ServicesRepository,
  type ServiceRecord,
} from "../infrastructure/repositories/services.repository.js";

@Injectable()
export class UpdateServiceUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly services: ServicesRepository,
    private readonly categories: ServiceCategoriesRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    id: ServiceId,
    input: ServiceUpdateInput,
  ): Promise<ServiceRecord> {
    assertValidServiceUpdateInput(input);

    return withWorkspaceContext(this.pool, context, async (tx) => {
      if (input.categoryId !== undefined && input.categoryId !== null) {
        const category = await this.categories.findById(tx, input.categoryId);
        this.services.assertCategoryResolved(input.categoryId, category);
      }

      return this.services.update(tx, id, {
        name: input.name,
        categoryId: input.categoryId,
        durationMinutes: input.durationMinutes,
        preBufferMinutes: input.preBufferMinutes,
        postBufferMinutes: input.postBufferMinutes,
        price: input.price,
        active: input.active,
      });
    });
  }
}
