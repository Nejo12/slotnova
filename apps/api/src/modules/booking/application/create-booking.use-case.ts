/**
 * `CreateBooking` — the only Booking creation path (data-model.md transition
 * table, row 1; FR-020). Produces a `confirmed` booking at version 1.
 *
 * PR-05 scope: this use case composes the domain aggregate and persists it.
 * It deliberately does NOT:
 *   - read the Service (the caller supplies already-resolved snapshot values,
 *     so Booking never acquires a Catalog repository — constitution III);
 *   - consult Scheduling availability (no accepted PR-05 task assigns that
 *     orchestration here — tasks.md puts the booking flow's composition in
 *     PR-07);
 *   - emit an outbox event or an audit record. `research.md` allows Booking
 *     events to stay deferred until a real consumer exists, and Phase 2
 *     implements no Recovery/Notifications consumer (FR-027, ADR-024), so
 *     inventing one here would be speculative;
 *   - apply `Idempotency-Key` replay. That is an HTTP-boundary contract
 *     (`contracts/booking.contract.md`) and belongs to PR-07 with the
 *     endpoint that carries the header.
 *
 * Overlap prevention is PR-06's: this use case performs no availability or
 * overlap check, precisely so no check-then-insert pattern can be mistaken
 * for protection (AGENTS.md hard prohibition).
 */
import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";
import type { Pool, PoolClient } from "@slotnova/db";

import { asWorkspaceId } from "../../identity/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { bookingBlockingInterval, createBooking } from "../domain/booking.js";
import { BookingOverlapError } from "../domain/booking-errors.js";
import { asBookingId, type ServiceReferenceId } from "../domain/ids.js";
import {
  BookingsRepository,
  type BookingRecord,
} from "../infrastructure/repositories/bookings.repository.js";
import { RequestedBookingOverlapError } from "./booking-application-errors.js";

export interface CreateBookingCommand {
  readonly serviceId: ServiceReferenceId;
  readonly startsAt: Temporal.Instant;
  /** Snapshotted Service values, resolved by the caller (never read here). */
  readonly serviceDurationMinutes: number;
  readonly preBufferMinutes: number;
  readonly postBufferMinutes: number;
}

@Injectable()
export class CreateBookingUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bookings: BookingsRepository,
  ) {}

  async execute(context: WorkspaceContext, command: CreateBookingCommand): Promise<BookingRecord> {
    return withWorkspaceContext(this.pool, context, (tx) =>
      this.executeInTransaction(tx, context, command),
    );
  }

  /**
   * The same creation, run on a transaction the caller already owns.
   * Extracted in PR-07 so `CreateBookingIdempotentlyUseCase` can place the
   * idempotency claim, the Catalog Service snapshot read, this insert and the
   * stored replay response in ONE transaction — the mandatory contract of
   * `platform/idempotency/executeIdempotently` — instead of duplicating the
   * creation logic. Mirrors `CreateServiceUseCase.executeInTransaction`
   * exactly (PR-02). `execute` above is unchanged behaviorally: it simply
   * opens the transaction itself and delegates here.
   */
  async executeInTransaction(
    tx: PoolClient,
    context: WorkspaceContext,
    command: CreateBookingCommand,
  ): Promise<BookingRecord> {
    // Domain first: an invalid duration/buffer is rejected before any
    // database work, and the aggregate decides the status and version.
    const booking = createBooking({
      id: asBookingId(randomUUID()),
      serviceId: command.serviceId,
      startsAt: command.startsAt,
      serviceDurationMinutes: command.serviceDurationMinutes,
      preBufferMinutes: command.preBufferMinutes,
      postBufferMinutes: command.postBufferMinutes,
    });

    try {
      return await this.bookings.create(tx, asWorkspaceId(context.workspaceId), booking);
    } catch (error) {
      // The database rejected the insert under `bookings_no_overlap`. Restate
      // the window THIS request asked to block — computed from the aggregate
      // that was just built, via the same `bookingBlockingInterval` the
      // database's generated column mirrors, never a second formula — so the
      // HTTP boundary can answer "try another slot" with real context
      // (`contracts/booking.contract.md`). Nothing is read about the booking
      // that was already there; no extra query is issued.
      if (error instanceof BookingOverlapError) {
        const requested = bookingBlockingInterval(booking);
        throw new RequestedBookingOverlapError(requested.start, requested.end);
      }
      throw error;
    }
  }
}
