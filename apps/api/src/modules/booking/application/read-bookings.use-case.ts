/**
 * Booking read paths for `GET /v1/bookings` and `GET /v1/bookings/:id`
 * (`contracts/booking.contract.md`, PR-07, issue #73).
 *
 * One file, two small use cases: each is a single RLS-scoped repository call
 * with no invariant of its own, and splitting two four-line reads across two
 * files would be ceremony nothing warrants — the same reasoning, and the same
 * shape, as `catalog/application/read-catalog.use-case.ts`. They exist at all
 * (rather than the controller calling the repository) because the
 * transaction/tenant-context boundary belongs to the application layer, as
 * every other use case in this module already establishes.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "@slotnova/db";

import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import type { BookingId } from "../domain/ids.js";
import {
  BookingsRepository,
  type BookingListQuery,
  type BookingRecord,
} from "../infrastructure/repositories/bookings.repository.js";

@Injectable()
export class ListBookingsUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bookings: BookingsRepository,
  ) {}

  async execute(context: WorkspaceContext, query: BookingListQuery): Promise<BookingRecord[]> {
    return withWorkspaceContext(this.pool, context, (tx) => this.bookings.list(tx, query));
  }
}

@Injectable()
export class GetBookingUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bookings: BookingsRepository,
  ) {}

  /**
   * `null` both for "no such booking" and for "a booking belonging to another
   * workspace" — the RLS-scoped query cannot tell them apart, which is what
   * makes the two indistinguishable to a caller (the controller turns both
   * into the same `404`).
   */
  async execute(context: WorkspaceContext, id: BookingId): Promise<BookingRecord | null> {
    return withWorkspaceContext(this.pool, context, (tx) => this.bookings.findById(tx, id));
  }
}
