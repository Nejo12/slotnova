/**
 * `POST /v1/scheduling/availability-patterns`
 * (`contracts/scheduling.contract.md`, issue #66).
 *
 * ## Validation
 *
 * Every recurrence invariant — IANA timezone validity, ISO day range,
 * `0 <= start < end <= 1440` local minutes, no two rules overlapping within a
 * day, `effectiveFrom < effectiveUntil` — is asserted by the MERGED PR-03
 * domain (`createWeeklyAvailabilityPattern`), called before any database work.
 * Nothing is re-validated here and no invalid domain state can be persisted.
 *
 * ## Pattern-history invariant (proposed in PR-04, RATIFIED by the Founder on
 * PR #67 — now authoritative)
 *
 * The approved model gives a workspace exactly ONE availability pattern set
 * (`spec.md` Key Entities: "one pattern set per workspace";
 * `contracts/scheduling.contract.md`: "in practice at most the workspace's
 * single active pattern set, but returned as a list to allow effective-dated
 * pattern history"; `tasks.md` PR-04: "`resolve` ... over the workspace's
 * single pattern"). A list shape exists for *history*, i.e. windows that
 * follow one another in time — not for two patterns claiming the same date.
 *
 * No accepted artifact defines precedence between two simultaneously-effective
 * patterns. Rather than invent one (newest-wins / highest-id-wins / whatever
 * SQL happens to return first), creating a pattern whose effective window
 * overlaps an existing one is REJECTED. At most one pattern is then effective
 * on any date and `resolve` is deterministic without a precedence rule at all.
 *
 * ## Advisory lock AND constraint (PR-06, issue #70)
 *
 * The Founder ratified this invariant on PR #67, and PR-06 legitimately
 * installs `btree_gist`, so `0010_booking_overlap_exclusion.sql` now carries
 * `availability_patterns_no_overlapping_effective_window` —
 * `EXCLUDE USING gist (workspace_id WITH =,
 * (daterange(effective_from, effective_until, '[)')) WITH &&)` — the same
 * expression `existsOverlappingEffectiveWindow` already used. The database is
 * therefore the strongest boundary.
 *
 * The advisory lock and the read below STAY, and are still the ordinary path:
 * they produce the friendly deterministic `OverlappingEffectivePatternError`
 * (a `422` at the HTTP boundary) instead of a raw integrity failure. The
 * constraint is defense in depth for what the application guard cannot cover
 * — a direct SQL write, a future writer that forgets the lock, a window that
 * commits underneath an in-flight transaction. When it does fire, the
 * violation is mapped onto the SAME domain condition, so no SQL detail ever
 * reaches the caller and there is exactly ONE overlap vocabulary.
 *
 * There is still no precedence rule of any kind, at either layer.
 */
import type { Temporal } from "@js-temporal/polyfill";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, Queryable } from "@slotnova/db";

import { asWorkspaceId } from "../../identity/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { createWeeklyAvailabilityPattern } from "../domain/recurrence.js";
import type { WeeklyAvailabilityRule } from "../domain/recurrence.js";
import {
  AvailabilityPatternsRepository,
  type AvailabilityPatternRecord,
} from "../infrastructure/repositories/availability-patterns.repository.js";

/**
 * A pattern already covers part of the requested effective window. Carries no
 * id, date or SQL detail: the HTTP layer turns it into a `validation` problem
 * that tells the operator what to change without echoing persistence internals.
 */
export class OverlappingEffectivePatternError extends Error {
  override readonly name = "OverlappingEffectivePatternError";

  constructor() {
    super("another availability pattern is already effective during part of this effective window");
  }
}

export interface CreateAvailabilityPatternInput {
  readonly timezone: string;
  readonly weeklyRule: readonly WeeklyAvailabilityRule[];
  readonly effectiveFrom: Temporal.PlainDate | null;
  readonly effectiveUntil: Temporal.PlainDate | null;
}

/** PostgreSQL `exclusion_violation`. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * The ONE constraint whose violation means "this effective window overlaps an
 * existing one" (`0010_booking_overlap_exclusion.sql`).
 */
const PATTERN_OVERLAP_CONSTRAINT = "availability_patterns_no_overlapping_effective_window";

/**
 * Narrow translation, on PostgreSQL's STRUCTURED metadata (`code` +
 * `constraint`) rather than message text. Both must match: a bare `23P01`
 * could come from Booking's own exclusion constraint, and a constraint name
 * alone is only meaningful for an integrity error. Everything else — the
 * ordering CHECK, the tenant foreign key, an RLS refusal — is rethrown
 * untouched.
 */
function translatePatternOverlapViolation(error: unknown): never {
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (
    candidate.code === EXCLUSION_VIOLATION &&
    candidate.constraint === PATTERN_OVERLAP_CONSTRAINT
  ) {
    throw new OverlappingEffectivePatternError();
  }
  throw error;
}

/**
 * Serialise pattern creation for one workspace. Transaction-scoped, so it is
 * released by the surrounding COMMIT/ROLLBACK and can never leak. The key is
 * derived from a namespaced string so it cannot collide with an advisory lock
 * another feature takes later.
 */
async function lockWorkspacePatternHistory(tx: Queryable, workspaceId: string): Promise<void> {
  await tx.query(
    `SELECT pg_advisory_xact_lock(
              hashtextextended('scheduling:availability_patterns:' || $1::text, 0))`,
    [workspaceId],
  );
}

@Injectable()
export class CreateAvailabilityPatternUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly patterns: AvailabilityPatternsRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    input: CreateAvailabilityPatternInput,
  ): Promise<AvailabilityPatternRecord> {
    // PR-03 domain validation — the single source of recurrence invariants.
    const pattern = createWeeklyAvailabilityPattern({
      timeZone: input.timezone,
      rules: input.weeklyRule,
      effectiveFrom: input.effectiveFrom ?? undefined,
      effectiveUntil: input.effectiveUntil ?? undefined,
    });

    return withWorkspaceContext(this.pool, context, async (tx) => {
      await lockWorkspacePatternHistory(tx, context.workspaceId);

      const window = {
        from: pattern.effectiveFrom ?? null,
        until: pattern.effectiveUntil ?? null,
      };
      if (await this.patterns.existsOverlappingEffectiveWindow(tx, window)) {
        throw new OverlappingEffectivePatternError();
      }

      return this.patterns
        .create(tx, {
          workspaceId: asWorkspaceId(context.workspaceId),
          timezone: pattern.timeZone,
          weeklyRule: pattern.rules,
          effectiveFrom: window.from,
          effectiveUntil: window.until,
        })
        .catch(translatePatternOverlapViolation);
    });
  }
}
