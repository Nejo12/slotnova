/**
 * Service deactivation (issue #58: "Service deletion is NOT part of this
 * PR"). A thin convenience over `ServicesRepository.deactivate` — the row is
 * never removed; existing Bookings referencing an inactive Service are
 * unaffected (that behavior belongs to Booking, PR-05+, not here).
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
  ServicesRepository,
  type ServiceRecord,
} from "../infrastructure/repositories/services.repository.js";

@Injectable()
export class DeactivateServiceUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly services: ServicesRepository,
  ) {}

  async execute(context: WorkspaceContext, id: ServiceId): Promise<ServiceRecord> {
    return withWorkspaceContext(this.pool, context, (tx) => this.services.deactivate(tx, id));
  }
}
