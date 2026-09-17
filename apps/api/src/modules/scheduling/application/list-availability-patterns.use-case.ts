/**
 * `GET /v1/scheduling/availability-patterns`
 * (`contracts/scheduling.contract.md`, issue #66).
 *
 * A single RLS-scoped repository call with no invariant of its own. It exists
 * at all — rather than the controller calling the repository — because the
 * transaction/tenant-context boundary belongs to the application layer,
 * exactly as `catalog/application/read-catalog.use-case.ts` establishes.
 *
 * Ordering is the repository's documented chronological history order; it is
 * not a precedence rule (see
 * `create-availability-pattern.use-case.ts` — simultaneously-effective
 * patterns cannot exist, so nothing ever has to win over anything else).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import {
  AvailabilityPatternsRepository,
  type AvailabilityPatternRecord,
} from "../infrastructure/repositories/availability-patterns.repository.js";

@Injectable()
export class ListAvailabilityPatternsUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly patterns: AvailabilityPatternsRepository,
  ) {}

  async execute(context: WorkspaceContext): Promise<AvailabilityPatternRecord[]> {
    return withWorkspaceContext(this.pool, context, (tx) => this.patterns.list(tx));
  }
}
