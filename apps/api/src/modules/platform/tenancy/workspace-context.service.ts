import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "@slotnova/db";

import { DB_POOL } from "../database/database.tokens.js";
import { withWorkspaceContext, type WorkspaceContext } from "./with-workspace-context.js";

/**
 * Nest-injectable wrapper over {@link withWorkspaceContext}. This is the
 * narrow seam later identity/tenant-owned-data repositories depend on
 * (T021) — it is deliberately not a repository itself and defines no
 * identity/business queries (that is PR-08 onward).
 */
@Injectable()
export class WorkspaceContextService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  run<T>(context: WorkspaceContext, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    return withWorkspaceContext(this.pool, context, fn);
  }
}
