/**
 * ServiceCategory creation (`research.md` R-CAT). No workspace-global
 * uniqueness is imposed on `name` — no planning evidence requires it, and
 * inventing one would be a speculative constraint (constitution VI).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { asWorkspaceId } from "../../identity/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import {
  assertValidServiceCategoryCreateInput,
  type ServiceCategoryCreateInput,
} from "../domain/service-category.js";
import {
  ServiceCategoriesRepository,
  type ServiceCategoryRecord,
} from "../infrastructure/repositories/service-categories.repository.js";

@Injectable()
export class CreateServiceCategoryUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly categories: ServiceCategoriesRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    input: ServiceCategoryCreateInput,
  ): Promise<ServiceCategoryRecord> {
    assertValidServiceCategoryCreateInput(input);

    return withWorkspaceContext(this.pool, context, (tx) =>
      this.categories.create(tx, {
        workspaceId: asWorkspaceId(context.workspaceId),
        name: input.name,
        sortOrder: input.sortOrder,
      }),
    );
  }
}
