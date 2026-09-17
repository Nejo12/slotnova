/**
 * `scheduling.availability_patterns` access. Every method runs against a
 * transaction that already has `app.workspace_id` set (RLS-scoped by
 * construction, ADR-008) — this repository issues no unscoped query and
 * exposes no `findAll()`/cross-workspace lookup (data-model.md "Tenant
 * context contract"; issue #66 "no unscoped repository APIs").
 *
 * Four explicit, bounded methods and nothing else: no generic
 * `Repository<T>`, no `BaseRepository`, no CRUD base class (AGENTS.md hard
 * prohibitions).
 *
 * ## Time values never cross this boundary as `Date`
 *
 * node-postgres parses `date`/`timestamptz` columns into JavaScript `Date`
 * objects by default, which ADR-010 and AGENTS.md prohibit in scheduling
 * logic. Every temporal column is therefore projected to its ISO text form in
 * SQL (`effective_from::text`, `to_json(...)#>>'{}'`) and converted straight
 * to a `Temporal` value here, so no `Date` instance is ever constructed and
 * nothing above infrastructure handles a time string.
 */
import { Temporal } from "@js-temporal/polyfill";
import { Injectable } from "@nestjs/common";
import type { Queryable } from "@slotnova/db";

import type { WorkspaceId } from "../../../identity/index.js";
import type { AvailabilityPatternId } from "../../domain/ids.js";
import type { WeeklyAvailabilityRule } from "../../domain/recurrence.js";

export interface AvailabilityPatternRecord {
  readonly id: AvailabilityPatternId;
  readonly workspaceId: WorkspaceId;
  readonly timezone: string;
  /**
   * Structurally unvalidated on read: the authoritative check is the PR-03
   * domain's `createWeeklyAvailabilityPattern`, which every caller runs the
   * rehydrated rules through (it rejects a non-integer day or minute), so a
   * corrupt row fails loudly rather than being trusted because of this type.
   */
  readonly weeklyRule: readonly WeeklyAvailabilityRule[];
  /** Inclusive lower bound; `null` = unbounded. */
  readonly effectiveFrom: Temporal.PlainDate | null;
  /** EXCLUSIVE upper bound; `null` = unbounded. */
  readonly effectiveUntil: Temporal.PlainDate | null;
}

export interface AvailabilityPatternCreateInput {
  readonly workspaceId: WorkspaceId;
  readonly timezone: string;
  readonly weeklyRule: readonly WeeklyAvailabilityRule[];
  readonly effectiveFrom: Temporal.PlainDate | null;
  readonly effectiveUntil: Temporal.PlainDate | null;
}

/** Half-open local-date window `[from, until)`; `null` on either side is unbounded. */
export interface EffectiveWindow {
  readonly from: Temporal.PlainDate | null;
  readonly until: Temporal.PlainDate | null;
}

interface AvailabilityPatternRow {
  id: string;
  workspace_id: string;
  timezone: string;
  weekly_rule: unknown;
  effective_from: string | null;
  effective_until: string | null;
}

function toRecord(row: AvailabilityPatternRow): AvailabilityPatternRecord {
  return {
    id: row.id as AvailabilityPatternId,
    workspaceId: row.workspace_id as WorkspaceId,
    timezone: row.timezone,
    weeklyRule: (Array.isArray(row.weekly_rule)
      ? row.weekly_rule
      : []) as readonly WeeklyAvailabilityRule[],
    effectiveFrom: row.effective_from === null ? null : Temporal.PlainDate.from(row.effective_from),
    effectiveUntil:
      row.effective_until === null ? null : Temporal.PlainDate.from(row.effective_until),
  };
}

const SELECT = `
  SELECT id, workspace_id, timezone, weekly_rule,
         effective_from::text AS effective_from,
         effective_until::text AS effective_until
    FROM public.availability_patterns`;

/**
 * `ORDER BY` for every listing/expansion query.
 *
 * Chronological by effective window, which is the only ordering the approved
 * model's own vocabulary supplies ("effective-dated pattern history",
 * `contracts/scheduling.contract.md`): an unbounded `effective_from` is the
 * oldest window, so it sorts first. `id` is a final tie-break so the order is
 * total even if the history invariant were ever violated by a direct database
 * write — it is NOT a precedence rule, and no code anywhere treats "first" or
 * "last" in this list as winning over another pattern (see
 * `create-availability-pattern.use-case.ts`: simultaneously-effective patterns
 * cannot be created, so precedence never arises).
 */
const ORDER_BY = `ORDER BY effective_from ASC NULLS FIRST, effective_until ASC NULLS LAST, id ASC`;

/** Text form PostgreSQL accepts for an unbounded `daterange` endpoint. */
function dateParam(value: Temporal.PlainDate | null): string | null {
  return value === null ? null : value.toString();
}

@Injectable()
export class AvailabilityPatternsRepository {
  async create(
    tx: Queryable,
    input: AvailabilityPatternCreateInput,
  ): Promise<AvailabilityPatternRecord> {
    const { rows } = await tx.query(
      `INSERT INTO public.availability_patterns
         (workspace_id, timezone, weekly_rule, effective_from, effective_until)
       VALUES ($1, $2, $3::jsonb, $4::date, $5::date)
       RETURNING id, workspace_id, timezone, weekly_rule,
                 effective_from::text AS effective_from,
                 effective_until::text AS effective_until`,
      [
        input.workspaceId,
        input.timezone,
        JSON.stringify(input.weeklyRule),
        dateParam(input.effectiveFrom),
        dateParam(input.effectiveUntil),
      ],
    );
    return toRecord(rows[0] as AvailabilityPatternRow);
  }

  /**
   * Every pattern in the active workspace, oldest effective window first.
   * Scoped by the transaction's RLS context, so this is a per-workspace
   * listing, never an unrestricted `findAll()`. The contract defines no
   * cursor for patterns (a workspace holds a handful of history rows at
   * most), and inventing one would be API surface this PR was not asked to
   * add.
   */
  async list(tx: Queryable): Promise<AvailabilityPatternRecord[]> {
    const { rows } = await tx.query(`${SELECT} ${ORDER_BY}`);
    return (rows as AvailabilityPatternRow[]).map(toRecord);
  }

  /**
   * The patterns whose effective window overlaps `window`, i.e. exactly those
   * that can contribute availability inside it. Half-open `[from, until)` on
   * both sides — `daterange(a, b, '[)')` with a NULL endpoint is unbounded,
   * which is precisely what a NULL `effective_from`/`effective_until` means —
   * so a pattern ending exactly at the window's start contributes nothing and
   * is correctly excluded (the same exclusive-upper-bound rule the Founder
   * fixed for `effectiveUntil`).
   */
  async listOverlappingEffectiveWindow(
    tx: Queryable,
    window: EffectiveWindow,
  ): Promise<AvailabilityPatternRecord[]> {
    const { rows } = await tx.query(
      `${SELECT}
        WHERE daterange(effective_from, effective_until, '[)')
           && daterange($1::date, $2::date, '[)')
        ${ORDER_BY}`,
      [dateParam(window.from), dateParam(window.until)],
    );
    return (rows as AvailabilityPatternRow[]).map(toRecord);
  }

  /**
   * `true` when some pattern in the active workspace is already effective at
   * any point inside `window` — the read half of the pattern-history
   * invariant (see `create-availability-pattern.use-case.ts`, which holds a
   * per-workspace advisory lock across this check and the insert so the two
   * cannot race).
   */
  async existsOverlappingEffectiveWindow(tx: Queryable, window: EffectiveWindow): Promise<boolean> {
    const { rows } = await tx.query(
      `SELECT 1
         FROM public.availability_patterns
        WHERE daterange(effective_from, effective_until, '[)')
           && daterange($1::date, $2::date, '[)')
        LIMIT 1`,
      [dateParam(window.from), dateParam(window.until)],
    );
    return rows.length > 0;
  }
}
