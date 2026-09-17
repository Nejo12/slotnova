/**
 * `scheduling.availability_exceptions` access. Every method runs against a
 * transaction that already has `app.workspace_id` set (RLS-scoped by
 * construction, ADR-008) — no unscoped query, no `findAll()`, no generic CRUD
 * base class (AGENTS.md hard prohibitions; issue #66).
 *
 * Two explicit methods: create one exception, and list the ones overlapping a
 * requested instant range. See the sibling patterns repository for why every
 * temporal column is projected to ISO text in SQL and converted to a
 * `Temporal` value here rather than being returned as a JavaScript `Date`
 * (ADR-010).
 */
import { Temporal } from "@js-temporal/polyfill";
import { Injectable } from "@nestjs/common";
import type { Queryable } from "@slotnova/db";

import type { WorkspaceId } from "../../../identity/index.js";
import type { AvailabilityExceptionId } from "../../domain/ids.js";
import type { Interval } from "../../domain/interval.js";

export interface AvailabilityExceptionRecord {
  readonly id: AvailabilityExceptionId;
  readonly workspaceId: WorkspaceId;
  /** Inclusive lower bound of the half-open `[startsAt, endsAt)` span. */
  readonly startsAt: Temporal.Instant;
  /** Exclusive upper bound of the half-open `[startsAt, endsAt)` span. */
  readonly endsAt: Temporal.Instant;
  readonly reason: string | null;
}

export interface AvailabilityExceptionCreateInput {
  readonly workspaceId: WorkspaceId;
  readonly interval: Interval;
  readonly reason: string | null;
}

interface AvailabilityExceptionRow {
  id: string;
  workspace_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

function toRecord(row: AvailabilityExceptionRow): AvailabilityExceptionRecord {
  return {
    id: row.id as AvailabilityExceptionId,
    workspaceId: row.workspace_id as WorkspaceId,
    startsAt: Temporal.Instant.from(row.starts_at),
    endsAt: Temporal.Instant.from(row.ends_at),
    reason: row.reason,
  };
}

/**
 * `to_json(...)#>>'{}'` renders a `timestamptz` as ISO-8601 with an explicit
 * offset, which `Temporal.Instant.from` parses directly — unlike the default
 * node-postgres parse (a JavaScript `Date`) or a bare `::text` cast (a
 * space-separated form Temporal rejects).
 */
const SELECT = `
  SELECT id, workspace_id,
         to_json(starts_at) #>> '{}' AS starts_at,
         to_json(ends_at)   #>> '{}' AS ends_at,
         reason
    FROM public.availability_exceptions`;

@Injectable()
export class AvailabilityExceptionsRepository {
  async create(
    tx: Queryable,
    input: AvailabilityExceptionCreateInput,
  ): Promise<AvailabilityExceptionRecord> {
    const { rows } = await tx.query(
      `INSERT INTO public.availability_exceptions
         (workspace_id, starts_at, ends_at, reason)
       VALUES ($1, $2::timestamptz, $3::timestamptz, $4)
       RETURNING id, workspace_id,
                 to_json(starts_at) #>> '{}' AS starts_at,
                 to_json(ends_at)   #>> '{}' AS ends_at,
                 reason`,
      [
        input.workspaceId,
        input.interval.start.toString(),
        input.interval.end.toString(),
        input.reason,
      ],
    );
    return toRecord(rows[0] as AvailabilityExceptionRow);
  }

  /**
   * Exceptions overlapping the half-open instant range `[from, to)`, oldest
   * first. Overlap is strict on both ends (`starts_at < to AND ends_at >
   * from`), so an exception that merely touches the range boundary is
   * excluded — the same half-open rule `intervalsOverlap` applies in the
   * domain, and it removes nothing from the range anyway.
   *
   * Uses the `(workspace_id, starts_at)` index from
   * `0008_scheduling.sql`; RLS supplies the workspace predicate.
   */
  async listOverlapping(tx: Queryable, range: Interval): Promise<AvailabilityExceptionRecord[]> {
    const { rows } = await tx.query(
      `${SELECT}
        WHERE starts_at < $2::timestamptz
          AND ends_at   > $1::timestamptz
        ORDER BY starts_at ASC, ends_at ASC, id ASC`,
      [range.start.toString(), range.end.toString()],
    );
    return (rows as AvailabilityExceptionRow[]).map(toRecord);
  }
}
