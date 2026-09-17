/**
 * `RescheduleBooking` — `confirmed` -> `confirmed` at a new instant
 * (data-model.md transition table, row 2). Not idempotent by design: each
 * reschedule is a distinct intent, so the version guard is the only
 * protection against a lost update.
 *
 * Load -> domain transition -> version-guarded UPDATE, all inside ONE
 * transaction with the tenant context set. The read is not the concurrency
 * guard: the UPDATE carries `AND version = $expectedVersion` itself, and a
 * zero-row result is reported as the stale-write condition PR-07 will
 * translate into `409 stale-write`.
 *
 * The snapshot is never re-read from Catalog here — see `domain/booking.ts`.
 * Overlap re-checking is PR-06's (the exclusion constraint will reject a
 * conflicting new range at the database level).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { bookingBlockingInterval, rescheduleBooking } from "../domain/booking.js";
import {
  BookingNotFoundError,
  BookingOverlapError,
  StaleBookingVersionError,
} from "../domain/booking-errors.js";
import type { BookingId } from "../domain/ids.js";
import {
  BookingsRepository,
  type BookingRecord,
} from "../infrastructure/repositories/bookings.repository.js";
import { RequestedBookingOverlapError } from "./booking-application-errors.js";

export interface RescheduleBookingCommand {
  readonly bookingId: BookingId;
  readonly expectedVersion: number;
  readonly startsAt: Temporal.Instant;
}

@Injectable()
export class RescheduleBookingUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bookings: BookingsRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    command: RescheduleBookingCommand,
  ): Promise<BookingRecord> {
    return withWorkspaceContext(this.pool, context, async (tx) => {
      const current = await this.bookings.findById(tx, command.bookingId);
      if (current === null) throw new BookingNotFoundError(command.bookingId);

      // Throws StaleBookingVersionError / InvalidBookingTransitionError.
      const next = rescheduleBooking(current, {
        expectedVersion: command.expectedVersion,
        startsAt: command.startsAt,
      });

      // Same overlap enrichment as creation (PR-07): the requested window is
      // the ALREADY-SNAPSHOTTED duration/buffers applied to the new
      // `startsAt`, so restating it re-reads nothing and reveals nothing
      // about whichever confirmed booking is in the way.
      const updated = await this.bookings
        .reschedule(tx, command.bookingId, {
          startsAt: next.startsAt,
          expectedVersion: command.expectedVersion,
          nextVersion: next.version,
        })
        .catch((error: unknown) => {
          if (error instanceof BookingOverlapError) {
            const requested = bookingBlockingInterval(next);
            throw new RequestedBookingOverlapError(requested.start, requested.end);
          }
          throw error;
        });
      if (updated !== null) return updated;

      // The guard matched no row: something committed between the read and
      // the write in this transaction. Re-read so the reported current
      // version is the real one rather than the stale one we loaded.
      const latest = await this.bookings.findById(tx, command.bookingId);
      if (latest === null) throw new BookingNotFoundError(command.bookingId);
      throw new StaleBookingVersionError(command.expectedVersion, latest.version);
    });
  }
}
