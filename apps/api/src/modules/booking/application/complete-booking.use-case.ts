/**
 * `CompleteBooking` — `confirmed` -> `completed` (data-model.md transition
 * table, row 4), or the authorised same-command idempotent no-op when the
 * booking is already `completed` and the caller holds the current version
 * (data-model.md: "re-completing with same version is a no-op success"). See
 * `domain/booking.ts` for the full source reconciliation.
 *
 * A completed booking stays a historical record: nothing is deleted and the
 * `blocking_range` is not mutated. As with cancel, a no-op writes nothing.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { completeBooking, isBookingUnchanged } from "../domain/booking.js";
import { BookingNotFoundError, StaleBookingVersionError } from "../domain/booking-errors.js";
import type { BookingId } from "../domain/ids.js";
import {
  BookingsRepository,
  type BookingRecord,
} from "../infrastructure/repositories/bookings.repository.js";

export interface CompleteBookingCommand {
  readonly bookingId: BookingId;
  readonly expectedVersion: number;
}

@Injectable()
export class CompleteBookingUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bookings: BookingsRepository,
  ) {}

  async execute(
    context: WorkspaceContext,
    command: CompleteBookingCommand,
  ): Promise<BookingRecord> {
    return withWorkspaceContext(this.pool, context, async (tx) => {
      const current = await this.bookings.findById(tx, command.bookingId);
      if (current === null) throw new BookingNotFoundError(command.bookingId);

      // Throws StaleBookingVersionError / InvalidBookingTransitionError.
      const next = completeBooking(current, { expectedVersion: command.expectedVersion });
      if (isBookingUnchanged(current, next)) return current;

      const updated = await this.bookings.complete(tx, command.bookingId, {
        expectedVersion: command.expectedVersion,
        nextVersion: next.version,
      });
      if (updated !== null) return updated;

      const latest = await this.bookings.findById(tx, command.bookingId);
      if (latest === null) throw new BookingNotFoundError(command.bookingId);
      throw new StaleBookingVersionError(command.expectedVersion, latest.version);
    });
  }
}
