/**
 * `POST /v1/scheduling/availability-exceptions`
 * (`contracts/scheduling.contract.md`, FR-012, issue #66).
 *
 * An exception is always a pair of RESOLVED instants, never a recurring rule.
 * The half-open `[startsAt, endsAt)` invariant with `startsAt < endsAt` is
 * asserted by the merged PR-03 domain's `createInterval` before any database
 * work (and again by the `availability_exceptions_half_open_range` CHECK in
 * `0008_scheduling.sql`), so no invalid interval can be persisted.
 *
 * There is no overlap rule between exceptions: two overlapping time-off spans
 * both simply subtract, and the domain's `subtractIntervals` normalises them.
 * Exception precedence is fixed by FR-012 — an exception always wins over the
 * recurring pattern for its overlapping span — and needs no column, flag or
 * ordering.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";
import type { Pool } from "@slotnova/db";

import { asWorkspaceId } from "../../identity/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { createInterval } from "../domain/interval.js";
import {
  AvailabilityExceptionsRepository,
  type AvailabilityExceptionRecord,
} from "../infrastructure/repositories/availability-exceptions.repository.js";

export interface CreateAvailabilityExceptionInput {
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly reason: string | null;
}

@Injectable()
export class CreateAvailabilityExceptionUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly exceptions: AvailabilityExceptionsRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    input: CreateAvailabilityExceptionInput,
  ): Promise<AvailabilityExceptionRecord> {
    // PR-03 domain: throws unless start < end (half-open, never empty).
    const interval = createInterval(input.startsAt, input.endsAt);

    return withWorkspaceContext(this.pool, context, (tx) =>
      this.exceptions.create(tx, {
        workspaceId: asWorkspaceId(context.workspaceId),
        interval,
        reason: input.reason,
      }),
    );
  }
}
