/**
 * `GET /v1/calendar?from=&to=` (`contracts/calendar.contract.md`,
 * `research.md` R-CAL, FR-030, PR-09, issue #81).
 *
 * A PURE READ COMPOSITION. It owns no table, no row and no state: there is
 * no Calendar migration, no Calendar repository and no `infrastructure/`
 * directory in this module, and nothing on any path here writes, enqueues an
 * outbox event or schedules a job. Everything it returns comes from two
 * sibling modules' published application ports.
 *
 * ## The two seams, and what each one owns
 *
 * - {@link AvailabilityReadPort} (Scheduling) — OPEN time. Scheduling
 *   remains the sole authority for recurrence, IANA timezones, DST,
 *   exceptions and the 370-day expansion horizon. None of that is reasoned
 *   about here.
 * - {@link BookingOccupancyPort} (Booking) — OCCUPIED time. Booking remains
 *   the sole authority for `blocking_range`, the half-open overlap
 *   predicate, status and identity. No overlap arithmetic exists in this
 *   module.
 *
 * Neither port exposes a repository, a schema or a transaction, and this
 * file imports nothing from `scheduling/infrastructure/**`,
 * `booking/infrastructure/**` or either module's tables.
 *
 * ## The window, and why it is expressed in instants
 *
 * The caller supplies one bounded half-open ABSOLUTE window `[from, to)`.
 * That is the only vocabulary in which the two halves mean the same thing:
 * Booking's occupied intervals and Scheduling's resolved intervals are both
 * sets of UTC instants, and an instant window passes to Booking's list
 * untouched, preserving PR-07A's crossing-window semantics exactly.
 *
 * Scheduling, however, expands over LOCAL DATES. Calendar therefore asks it
 * for the UTC-date span covering `[from, to)` WIDENED BY ONE DAY on each
 * side, then clips the answer back to `[from, to)` with Scheduling's own
 * exported {@link intersectIntervals}. The widening is not a fudge factor:
 * UTC offsets run from -12:00 to +14:00, so a local day at either edge of
 * the requested window can land on the neighbouring UTC date, and asking
 * only for the UTC dates would silently drop real availability at the
 * window's boundary. One day is strictly more than the 14-hour maximum, and
 * the clip is exact, so the result is the same set an ideal implementation
 * would return. Clipping with the module's own interval algebra is not a
 * reimplementation of anything — it is Scheduling's published operation.
 *
 * ## Horizon
 *
 * The horizon guard is Scheduling's own `assertValidExpansionRange`, applied
 * to the window Calendar actually asks Scheduling to expand — the widened
 * one. A request is therefore rejected with the canonical 422 when the
 * expansion it would require exceeds `MAX_EXPANSION_HORIZON_DAYS` (370),
 * before any database access. The practical consequence, deliberately
 * documented rather than hidden: a Calendar window may be up to 368 days;
 * 369+ is refused. Nothing is silently clamped, and the safety cap is never
 * exceeded.
 *
 * ## Failure semantics
 *
 * NOT partial. The two reads are awaited in sequence and any failure from
 * either propagates to the problem filter, so a caller either gets the whole
 * composed view or an explicit error — never a view that shows open time
 * because the occupancy read failed. `contracts/calendar.contract.md`
 * authorises no partial or stale Calendar data, and a half-rendered Calendar
 * is a false statement about what is free.
 */
import { Injectable } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";

import { BookingOccupancyPort, type OccupiedBooking } from "../../booking/index.js";
import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import {
  AvailabilityReadPort,
  createInterval,
  intersectIntervals,
  type Interval,
} from "../../scheduling/index.js";

/** Strictly greater than the widest real UTC offset (+14:00 / -12:00). */
const BOUNDARY_WIDENING_DAYS = 1;

export interface ComposeCalendarInput {
  readonly from: Temporal.Instant;
  /** EXCLUSIVE. */
  readonly to: Temporal.Instant;
}

export interface CalendarView {
  readonly range: Interval;
  /** Open (bookable) time, clipped to the requested window. */
  readonly open: readonly Interval[];
  /** Occupied time with the minimum Booking identity a Calendar entry needs. */
  readonly occupied: readonly OccupiedBooking[];
}

@Injectable()
export class ComposeCalendarUseCase {
  constructor(
    private readonly availability: AvailabilityReadPort,
    private readonly occupancy: BookingOccupancyPort,
  ) {}

  async execute(context: WorkspaceContext, input: ComposeCalendarInput): Promise<CalendarView> {
    // The merged PR-03 interval algebra is the ONE place "a window must be
    // non-empty and half-open" is decided; an inverted or empty range raises
    // `InvalidIntervalBoundsError`, reported as 422. Deliberately not
    // re-encoded as a schema `.refine` that would report the same rule at a
    // different status.
    const window = createInterval(input.from, input.to);

    // Scheduling first: its horizon/range guard runs before any database
    // access, so an out-of-bounds request costs one comparison.
    const open = intersectIntervals(
      await this.availability.resolve(context, expansionRange(window)),
      [window],
    );

    const occupied = await this.occupancy.listOccupying(context, {
      from: window.start,
      to: window.end,
    });

    return { range: window, open, occupied };
  }
}

/**
 * The local-date window Scheduling is asked to expand: the UTC dates the
 * requested instants fall on, widened one day on each side. `to` is rounded
 * UP so a window ending mid-day still includes that day.
 */
function expansionRange(window: Interval): {
  from: Temporal.PlainDate;
  to: Temporal.PlainDate;
} {
  const startDate = window.start.toZonedDateTimeISO("UTC").toPlainDate();
  const endZoned = window.end.toZonedDateTimeISO("UTC");
  const endDate = endZoned.toPlainTime().equals(Temporal.PlainTime.from("00:00"))
    ? endZoned.toPlainDate()
    : endZoned.toPlainDate().add({ days: 1 });

  return {
    from: startDate.subtract({ days: BOUNDARY_WIDENING_DAYS }),
    to: endDate.add({ days: BOUNDARY_WIDENING_DAYS }),
  };
}
