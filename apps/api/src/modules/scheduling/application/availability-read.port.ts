/**
 * Scheduling's deliberate public port for "which absolute intervals is this
 * workspace open over this bounded local-date window?" (PR-09, issue #81,
 * `contracts/calendar.contract.md`).
 *
 * ## Why this file exists at all
 *
 * Calendar is a read COMPOSITION, not a bounded context (ADR-012): it must
 * ask Scheduling for resolved availability and must not learn that
 * `availability_patterns`/`availability_exceptions` exist. Importing
 * `scheduling/infrastructure/**` from another module is a hard prohibition
 * (constitution III, dependency-cruiser `no-cross-module-internals`), and a
 * cross-module SQL query is equally forbidden. So Scheduling owns and
 * publishes this port, exactly as Catalog owns and publishes
 * `ServiceSnapshotPort` for Booking (PR-07).
 *
 * ## Why it is a delegate, not a second implementation
 *
 * `resolve` forwards verbatim to {@link ResolveAvailabilityUseCase} — the
 * SAME use case `POST /v1/scheduling/availability/resolve` serves. Every
 * recurrence, IANA-timezone, DST, exception-subtraction and
 * expansion-horizon rule therefore applies identically to a Calendar read
 * and to a direct resolve call, because it is literally the same code path.
 * Nothing about Scheduling's behaviour is re-derived, relaxed or duplicated
 * for Calendar, and the 370-day `MAX_EXPANSION_HORIZON_DAYS` guard still
 * runs before any database work.
 *
 * ## Why it opens its own transaction
 *
 * Unlike `ServiceSnapshotPort`, this port does NOT take the caller's
 * transaction. It has no atomicity relationship with anything: Calendar
 * writes nothing, on any path, so there is no invariant that would be broken
 * by the two halves of the composition reading in two short-lived read
 * transactions. Offering a `readInTransaction` overload would mean Calendar
 * had to open and own a Scheduling-shaped transaction, which is precisely
 * the leak this port exists to prevent.
 */
import { Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";

import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import type { Interval } from "../domain/interval.js";
import { ResolveAvailabilityUseCase } from "./resolve-availability.use-case.js";

/** A bounded half-open LOCAL-date window, exactly as resolve accepts one. */
export interface AvailabilityReadRange {
  /** Inclusive local start date. */
  readonly from: Temporal.PlainDate;
  /** EXCLUSIVE local end date. */
  readonly to: Temporal.PlainDate;
}

@Injectable()
export class AvailabilityReadPort {
  constructor(private readonly resolveAvailability: ResolveAvailabilityUseCase) {}

  /**
   * Normalised half-open UTC instant intervals the workspace is open for.
   * Throws `InvalidExpansionRangeError`/`ExpansionHorizonExceededError` for
   * an inverted or over-horizon window, before any database access.
   */
  async resolve(
    context: WorkspaceContext,
    range: AvailabilityReadRange,
  ): Promise<readonly Interval[]> {
    return this.resolveAvailability.execute(context, { from: range.from, to: range.to });
  }
}
