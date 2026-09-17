/**
 * `POST /v1/scheduling/availability/resolve`
 * (`contracts/scheduling.contract.md`, FR-010–FR-015, issue #66).
 *
 * A PURE QUERY. It opens a transaction only to read under the workspace's RLS
 * context and writes nothing — no row is inserted, updated or deleted on any
 * code path here, and the repositories it uses expose no write method it could
 * reach. It reads Scheduling's own two tables and nothing else: no Booking
 * query, no Calendar query, no Catalog query.
 *
 * The pipeline is deliberately thin glue over the merged PR-03 domain:
 *
 *   1. `assertValidExpansionRange` — reject an inverted range or one wider
 *      than `MAX_EXPANSION_HORIZON_DAYS` (370) BEFORE any database work, so a
 *      rejected request costs one comparison rather than a pattern load and an
 *      expansion attempt;
 *   2. load the persisted patterns whose effective window overlaps `[from,to)`;
 *   3. `expandWeeklyAvailability` per pattern — ALL recurrence, IANA-timezone
 *      and DST reasoning, and all `effectiveFrom`/`effectiveUntil` clipping
 *      (upper bound EXCLUSIVE), happens there and nowhere else;
 *   4. `unionIntervals` the expansions — the pattern-history invariant
 *      (`create-availability-pattern.use-case.ts`) guarantees the effective
 *      windows are disjoint, so this is a concatenation of non-competing
 *      windows, never a merge of rival patterns needing a precedence rule;
 *   5. load the exceptions overlapping the expanded span and
 *      `subtractIntervals` them (FR-012 — an exception always wins);
 *   6. return the normalised half-open UTC instant intervals.
 *
 * No DST handling, recurrence logic, normalisation or interval subtraction is
 * reimplemented in this file, and no JavaScript `Date` is constructed anywhere
 * in the path (ADR-010).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";
import type { Pool, PoolClient } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { createInterval, type Interval } from "../domain/interval.js";
import { subtractIntervals, unionIntervals } from "../domain/interval-set.js";
import {
  assertValidExpansionRange,
  createWeeklyAvailabilityPattern,
  expandWeeklyAvailability,
} from "../domain/recurrence.js";
import { AvailabilityExceptionsRepository } from "../infrastructure/repositories/availability-exceptions.repository.js";
import {
  AvailabilityPatternsRepository,
  type AvailabilityPatternRecord,
} from "../infrastructure/repositories/availability-patterns.repository.js";

export interface ResolveAvailabilityInput {
  /** Inclusive local start date of the half-open request window. */
  readonly from: Temporal.PlainDate;
  /** Exclusive local end date of the half-open request window. */
  readonly to: Temporal.PlainDate;
}

@Injectable()
export class ResolveAvailabilityUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly patterns: AvailabilityPatternsRepository,
    private readonly exceptions: AvailabilityExceptionsRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    input: ResolveAvailabilityInput,
  ): Promise<readonly Interval[]> {
    const range = { from: input.from, to: input.to };
    // Bounded-horizon guard first: nothing is loaded or materialised for a
    // request that is already out of bounds (FR-015).
    assertValidExpansionRange(range);

    return withWorkspaceContext(this.pool, context, async (tx) => {
      const records = await this.patterns.listOverlappingEffectiveWindow(tx, {
        from: range.from,
        until: range.to,
      });

      const available = records.reduce<readonly Interval[]>(
        (accumulated, record) => unionIntervals(accumulated, expand(record, range)),
        [],
      );
      if (available.length === 0) return [];

      return subtractIntervals(available, await this.loadExceptions(tx, available));
    });
  }

  /**
   * The exceptions that can actually remove something: those overlapping the
   * span the expanded availability occupies. An exception outside that span
   * subtracts nothing by definition, so bounding the query this way is exact,
   * not an approximation — and it needs no timezone reasoning of its own,
   * because the span is already in absolute instants.
   */
  private async loadExceptions(
    tx: PoolClient,
    available: readonly Interval[],
  ): Promise<readonly Interval[]> {
    const span = createInterval(available[0]!.start, available[available.length - 1]!.end);
    const records = await this.exceptions.listOverlapping(tx, span);
    return records.map((record) => createInterval(record.startsAt, record.endsAt));
  }
}

/**
 * Rehydrate a persisted row through the PR-03 domain constructor (which
 * re-asserts every recurrence invariant, so a corrupted row fails loudly
 * rather than silently producing wrong availability) and expand it over the
 * requested range.
 */
function expand(
  record: AvailabilityPatternRecord,
  range: { from: Temporal.PlainDate; to: Temporal.PlainDate },
): readonly Interval[] {
  return expandWeeklyAvailability(
    createWeeklyAvailabilityPattern({
      timeZone: record.timezone,
      rules: record.weeklyRule,
      effectiveFrom: record.effectiveFrom ?? undefined,
      effectiveUntil: record.effectiveUntil ?? undefined,
    }),
    range,
  );
}
