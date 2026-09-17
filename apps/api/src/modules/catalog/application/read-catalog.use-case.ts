/**
 * Catalog read paths for `GET /catalog/services`,
 * `GET /catalog/services/:id` and `GET /catalog/categories`
 * (`contracts/catalog.contract.md`, PR-02).
 *
 * One file, three small use cases: each is a single RLS-scoped repository
 * call with no invariant of its own, and splitting three four-line reads
 * across three files would be ceremony `catalog`'s supporting tier does not
 * warrant (AGENTS.md module tiering; constitution VI rule of three). They
 * exist at all — rather than the controllers calling the repositories —
 * because the transaction/tenant-context boundary belongs to the
 * application layer, exactly as the PR-01 write use cases already establish.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import type { ServiceId } from "../domain/ids.js";
import {
  ServiceCategoriesRepository,
  type ServiceCategoryRecord,
} from "../infrastructure/repositories/service-categories.repository.js";
import {
  ServicesRepository,
  type ServiceListQuery,
  type ServiceRecord,
} from "../infrastructure/repositories/services.repository.js";

@Injectable()
export class ListServicesUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly services: ServicesRepository,
  ) {}

  async execute(context: WorkspaceContext, query: ServiceListQuery): Promise<ServiceRecord[]> {
    return withWorkspaceContext(this.pool, context, (tx) => this.services.list(tx, query));
  }
}

@Injectable()
export class GetServiceUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly services: ServicesRepository,
  ) {}

  /**
   * `null` both for "no such service" and for "a service belonging to
   * another workspace" — the RLS-scoped query cannot tell them apart, which
   * is what makes the two indistinguishable to a caller.
   */
  async execute(context: WorkspaceContext, id: ServiceId): Promise<ServiceRecord | null> {
    return withWorkspaceContext(this.pool, context, (tx) => this.services.findById(tx, id));
  }
}

@Injectable()
export class ListServiceCategoriesUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly categories: ServiceCategoriesRepository,
  ) {}

  async execute(context: WorkspaceContext): Promise<ServiceCategoryRecord[]> {
    return withWorkspaceContext(this.pool, context, (tx) => this.categories.list(tx));
  }
}
