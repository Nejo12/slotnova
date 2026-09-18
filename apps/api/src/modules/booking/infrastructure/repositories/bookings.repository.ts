/**
 * `booking.bookings` access. Every method runs against a transaction that
 * already has `app.workspace_id` set (RLS-scoped by construction, ADR-008) —
 * this repository issues no unscoped query and exposes no `findAll()`, no
 * cross-workspace lookup and no generic CRUD base class (AGENTS.md hard
 * prohibitions; issue #68). PR-05 added exactly five methods, one per
 * operation it had to prove; PR-07 adds the sixth — {@link list}, the bounded
 * window query the approved `GET /bookings?from=&to=&status=` contract needs.
 *
 * ## Optimistic concurrency
 *
 * The three mutating methods all carry `AND version = $expectedVersion` in
 * their own `WHERE` clause and report `updated = false` when that matches no
 * row. The guard therefore lives in the write statement itself, never in a
 * preceding `SELECT` — a read-then-write check as the sole protection is a
 * hard prohibition, and PR-06 will prove the same guard under two genuinely
 * concurrent connections.
 *
 * `AND status = 'confirmed'` is carried alongside it as defense in depth: the
 * caller has already run the domain transition, so a row that changed state
 * underneath it is a lost update, not a valid write.
 *
 * ## Temporal, not Date
 *
 * `to_json(...)#>>'{}'` renders a `timestamptz` as ISO-8601 with an explicit
 * offset, which `Temporal.Instant.from` parses directly — unlike the default
 * node-postgres parse (a JavaScript `Date`) or a bare `::text` cast (a
 * space-separated form Temporal rejects). Same convention as
 * `scheduling/infrastructure/repositories/*` (ADR-010).
 */
import { Temporal } from "@js-temporal/polyfill";
import { Injectable } from "@nestjs/common";
import type { Queryable } from "@slotnova/db";

import type { WorkspaceId } from "../../../identity/index.js";
import { BookingOverlapError } from "../../domain/booking-errors.js";
import type { Booking } from "../../domain/booking.js";
import type { BookingStatus } from "../../domain/booking-status.js";
import type { BookingId, ServiceReferenceId } from "../../domain/ids.js";

/**
 * A persisted booking: the aggregate plus the two things only the database
 * knows — its owning workspace and the generated blocking range's bounds.
 */
export interface BookingRecord extends Booking {
  readonly workspaceId: WorkspaceId;
  /** Inclusive lower bound of the generated half-open `blocking_range`. */
  readonly blockingRangeStart: Temporal.Instant;
  /** Exclusive upper bound of the generated half-open `blocking_range`. */
  readonly blockingRangeEnd: Temporal.Instant;
}

interface BookingRow {
  id: string;
  workspace_id: string;
  service_id: string;
  starts_at: string;
  service_duration_minutes: number;
  pre_buffer_minutes: number;
  post_buffer_minutes: number;
  blocking_range_start: string;
  blocking_range_end: string;
  status: BookingStatus;
  version: number;
  cancelled_reason: string | null;
}

function toRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id as BookingId,
    workspaceId: row.workspace_id as WorkspaceId,
    serviceId: row.service_id as ServiceReferenceId,
    startsAt: Temporal.Instant.from(row.starts_at),
    serviceDurationMinutes: row.service_duration_minutes,
    preBufferMinutes: row.pre_buffer_minutes,
    postBufferMinutes: row.post_buffer_minutes,
    blockingRangeStart: Temporal.Instant.from(row.blocking_range_start),
    blockingRangeEnd: Temporal.Instant.from(row.blocking_range_end),
    status: row.status,
    version: row.version,
    cancelledReason: row.cancelled_reason,
  };
}

const COLUMNS = `
  id, workspace_id, service_id,
  to_json(starts_at) #>> '{}' AS starts_at,
  service_duration_minutes, pre_buffer_minutes, post_buffer_minutes,
  to_json(lower(blocking_range)) #>> '{}' AS blocking_range_start,
  to_json(upper(blocking_range)) #>> '{}' AS blocking_range_end,
  status, version, cancelled_reason`;

/**
 * PostgreSQL's `exclusion_violation` class (SQLSTATE 23P01). Named rather
 * than inlined so the one place that matches on it is greppable.
 */
const EXCLUSION_VIOLATION = "23P01";

/**
 * The ONE constraint whose violation means "this booking overlaps another
 * confirmed booking in this workspace" (`0010_booking_overlap_exclusion.sql`).
 */
const OVERLAP_CONSTRAINT = "bookings_no_overlap";

/**
 * Narrow translation of the Booking overlap conflict, and nothing else.
 *
 * Matching is on PostgreSQL's STRUCTURED error metadata — `code` plus the
 * `constraint` field the server itself populates — never on message text,
 * which is localisable and not a contract. Both must match:
 *
 *   - mapping every `23P01` to a Booking overlap would misreport any other
 *     exclusion constraint added later (Scheduling already has one);
 *   - mapping on the constraint name alone would trust a field that is only
 *     meaningful for integrity errors.
 *
 * Every other failure — a CHECK violation, the tenant foreign key, an RLS
 * refusal, a connection error — is rethrown untouched. An unrelated integrity
 * failure must never be laundered into a domain conflict.
 */
function translateOverlapViolation(error: unknown): never {
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code === EXCLUSION_VIOLATION && candidate.constraint === OVERLAP_CONSTRAINT) {
    throw new BookingOverlapError();
  }
  throw error;
}

/**
 * A bounded half-open `[from, to)` window a booking's occupied interval must
 * OVERLAP, plus an optional single-status filter. Both bounds are required —
 * this repository never lists unbounded.
 */
export interface BookingListQuery {
  readonly from: Temporal.Instant;
  readonly to: Temporal.Instant;
  readonly status?: BookingStatus | undefined;
}

export interface RescheduleBookingRow {
  readonly startsAt: Temporal.Instant;
  readonly expectedVersion: number;
  readonly nextVersion: number;
}

export interface CancelBookingRow {
  readonly cancelledReason: string | null;
  readonly expectedVersion: number;
  readonly nextVersion: number;
}

export interface CompleteBookingRow {
  readonly expectedVersion: number;
  readonly nextVersion: number;
}

/**
 * Result of a version-guarded UPDATE. `null` means the guard matched no row:
 * the booking was concurrently mutated (or is no longer `confirmed`), which
 * the application translates into the domain's stale-write condition.
 */
export type GuardedUpdateResult = BookingRecord | null;

@Injectable()
export class BookingsRepository {
  /**
   * Persists an already-constructed aggregate. `status`, `version` and
   * `cancelled_reason` come from the domain rather than from database
   * defaults, so the row is a faithful copy of `createBooking`'s output and
   * the two cannot drift apart.
   *
   * `blocking_range` is NOT inserted: it is a STORED GENERATED column the
   * database computes from the snapshot, which is what makes it trustworthy
   * as the exclusion key of `bookings_no_overlap`.
   *
   * A `confirmed` insert whose range collides with another confirmed booking
   * in the same workspace is rejected by that constraint, and only that
   * rejection becomes {@link BookingOverlapError}. No overlap check runs
   * before the INSERT — the database is the boundary (ADR-011).
   */
  async create(tx: Queryable, workspaceId: WorkspaceId, booking: Booking): Promise<BookingRecord> {
    const result = await tx
      .query(
        `INSERT INTO public.bookings
         (id, workspace_id, service_id, starts_at, service_duration_minutes,
          pre_buffer_minutes, post_buffer_minutes, status, version, cancelled_reason)
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8::booking_status, $9, $10)
       RETURNING ${COLUMNS}`,
        [
          booking.id,
          workspaceId,
          booking.serviceId,
          booking.startsAt.toString(),
          booking.serviceDurationMinutes,
          booking.preBufferMinutes,
          booking.postBufferMinutes,
          booking.status,
          booking.version,
          booking.cancelledReason,
        ],
      )
      .catch(translateOverlapViolation);
    return toRecord(result.rows[0] as BookingRow);
  }

  /**
   * The bounded window query behind `GET /v1/bookings?from=&to=&status=`
   * (PR-07, issue #73; window semantics corrected by PR-07A, issue #75). NOT
   * a `findAll()`: `from`/`to` are both required by the boundary schema, so
   * every call is bounded by an explicit half-open window, and RLS scopes it
   * to the active workspace like every other method here.
   *
   * ## Which interval the window filters on
   *
   * The booking's OCCUPIED interval — the STORED GENERATED `blocking_range`
   * — must OVERLAP the requested half-open `[from, to)` window:
   *
   * ```sql
   * blocking_range && tstzrange($1::timestamptz, $2::timestamptz, '[)')
   * ```
   *
   * PR-07 originally filtered `starts_at >= from AND starts_at < to`. That is
   * wrong for occupation, and Founder review said so before PR #74 merged:
   * `contracts/calendar.contract.md` composes a day's occupied intervals from
   * this endpoint's results, and a booking can BEGIN before `from` while
   * remaining occupied inside the window — because the service duration
   * reaches in, because a post-buffer reaches in, or because the booking
   * crosses midnight. A `starts_at`-only predicate hides exactly those
   * bookings, so a Calendar built on it would show free time that is not.
   *
   * `blocking_range` is reused rather than recomputed in SQL or TypeScript:
   * it is the same generated column `bookings_no_overlap` excludes on
   * (`0010_booking_overlap_exclusion.sql`), so "visible in this window" and
   * "occupies this window" can never drift apart. The `'[)'` literal makes
   * the requested window half-open too, so PostgreSQL's own range semantics —
   * not an epsilon adjustment here — decide the boundaries: a booking ending
   * exactly at `from` and one starting exactly at `to` are both adjacent, not
   * overlapping, and neither is returned.
   *
   * ## Deterministic ordering
   *
   * `starts_at ASC, id ASC`. The `id` tiebreak is not decoration: two
   * bookings in one workspace can share a `starts_at` (they cannot both be
   * `confirmed`, but a cancelled one and a confirmed one can), and without it
   * PostgreSQL is free to return them in either order.
   *
   * No cursor/limit parameter: the accepted contract defines neither, and the
   * window itself is the bound. No resource/staff/location/client filter
   * exists here or anywhere — those dimensions do not exist in Phase 2.
   */
  async list(tx: Queryable, query: BookingListQuery): Promise<BookingRecord[]> {
    const conditions = ["blocking_range && tstzrange($1::timestamptz, $2::timestamptz, '[)')"];
    const params: unknown[] = [query.from.toString(), query.to.toString()];
    if (query.status !== undefined) {
      conditions.push(`status = $${params.length + 1}::booking_status`);
      params.push(query.status);
    }

    const { rows } = await tx.query(
      `SELECT ${COLUMNS} FROM public.bookings
        WHERE ${conditions.join(" AND ")}
        ORDER BY starts_at ASC, id ASC`,
      params,
    );
    return (rows as BookingRow[]).map(toRecord);
  }

  /** RLS-scoped point lookup. Returns `null` for another workspace's booking. */
  async findById(tx: Queryable, id: BookingId): Promise<BookingRecord | null> {
    const { rows } = await tx.query(`SELECT ${COLUMNS} FROM public.bookings WHERE id = $1`, [id]);
    const row = rows[0] as BookingRow | undefined;
    return row ? toRecord(row) : null;
  }

  /**
   * `confirmed` -> `confirmed` at a new `starts_at`; the range follows
   * automatically. Moving a booking on top of another confirmed booking in the
   * same workspace violates `bookings_no_overlap` exactly like a colliding
   * insert does, so the same narrow translation applies. Nothing re-checks
   * availability in TypeScript first.
   */
  async reschedule(
    tx: Queryable,
    id: BookingId,
    input: RescheduleBookingRow,
  ): Promise<GuardedUpdateResult> {
    const { rows } = await tx
      .query(
        `UPDATE public.bookings
          SET starts_at = $2::timestamptz, version = $3, updated_at = now()
        WHERE id = $1 AND version = $4 AND status = 'confirmed'
       RETURNING ${COLUMNS}`,
        [id, input.startsAt.toString(), input.nextVersion, input.expectedVersion],
      )
      .catch(translateOverlapViolation);
    const row = rows[0] as BookingRow | undefined;
    return row ? toRecord(row) : null;
  }

  /**
   * `confirmed` -> `cancelled`. The row and its `blocking_range` are kept
   * intact — `bookings_no_overlap`'s predicate is `WHERE (status =
   * 'confirmed')`, so the state change alone releases the capacity.
   *
   * No overlap translation here or in {@link complete}: both transitions move
   * the row OUT of the constraint's partial predicate, so neither can raise
   * an exclusion violation. Adding a `.catch` for an unreachable branch would
   * be speculative.
   */
  async cancel(
    tx: Queryable,
    id: BookingId,
    input: CancelBookingRow,
  ): Promise<GuardedUpdateResult> {
    const { rows } = await tx.query(
      `UPDATE public.bookings
          SET status = 'cancelled', cancelled_reason = $2, version = $3, updated_at = now()
        WHERE id = $1 AND version = $4 AND status = 'confirmed'
       RETURNING ${COLUMNS}`,
      [id, input.cancelledReason, input.nextVersion, input.expectedVersion],
    );
    const row = rows[0] as BookingRow | undefined;
    return row ? toRecord(row) : null;
  }

  /** `confirmed` -> `completed`. Nothing is deleted; the booking stays historical. */
  async complete(
    tx: Queryable,
    id: BookingId,
    input: CompleteBookingRow,
  ): Promise<GuardedUpdateResult> {
    const { rows } = await tx.query(
      `UPDATE public.bookings
          SET status = 'completed', version = $2, updated_at = now()
        WHERE id = $1 AND version = $3 AND status = 'confirmed'
       RETURNING ${COLUMNS}`,
      [id, input.nextVersion, input.expectedVersion],
    );
    const row = rows[0] as BookingRow | undefined;
    return row ? toRecord(row) : null;
  }
}
