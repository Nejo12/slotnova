/**
 * `CancelBooking` — `confirmed` -> `cancelled` (data-model.md transition
 * table, row 3), or the authorised same-command idempotent no-op when the
 * booking is already `cancelled` and the caller holds the current version
 * (`contracts/booking.contract.md`: "cancelling an already-`cancelled`
 * booking with a matching version returns `200` with the current state
 * (no-op), not an error"). See `domain/booking.ts` for the full source
 * reconciliation.
 *
 * A no-op performs NO database write at all — not even an `updated_at` touch
 * — so it cannot consume a version or disturb another writer.
 *
 * Capacity is released by the state change alone: nothing is deleted and the
 * historical `blocking_range` is preserved, because PR-06's exclusion
 * predicate only covers `confirmed` rows.
 *
 * No audit record or outbox event is emitted here: Phase 2 confirms no
 * consumer (`research.md`, FR-027, ADR-024), and the destructive-confirmation
 * requirement of FR-024 is a UI obligation, not a domain one.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { cancelBooking, isBookingUnchanged } from "../domain/booking.js";
import { BookingNotFoundError, StaleBookingVersionError } from "../domain/booking-errors.js";
import type { BookingId } from "../domain/ids.js";
import {
  BookingsRepository,
  type BookingRecord,
} from "../infrastructure/repositories/bookings.repository.js";

export interface CancelBookingCommand {
  readonly bookingId: BookingId;
  readonly expectedVersion: number;
  readonly reason: string | null;
}

@Injectable()
export class CancelBookingUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bookings: BookingsRepository,
  ) {}

  async execute(context: WorkspaceContext, command: CancelBookingCommand): Promise<BookingRecord> {
    return withWorkspaceContext(this.pool, context, async (tx) => {
      const current = await this.bookings.findById(tx, command.bookingId);
      if (current === null) throw new BookingNotFoundError(command.bookingId);

      // Throws StaleBookingVersionError / InvalidBookingTransitionError.
      const next = cancelBooking(current, {
        expectedVersion: command.expectedVersion,
        reason: command.reason,
      });
      if (isBookingUnchanged(current, next)) return current;

      const updated = await this.bookings.cancel(tx, command.bookingId, {
        cancelledReason: next.cancelledReason,
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
