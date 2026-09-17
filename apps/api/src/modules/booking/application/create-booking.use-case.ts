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
import type { Pool } from "@slotnova/db";

import { asWorkspaceId } from "../../identity/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import { createBooking } from "../domain/booking.js";
import { asBookingId, type ServiceReferenceId } from "../domain/ids.js";
import {
  BookingsRepository,
  type BookingRecord,
} from "../infrastructure/repositories/bookings.repository.js";

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

    return withWorkspaceContext(this.pool, context, (tx) =>
      this.bookings.create(tx, asWorkspaceId(context.workspaceId), booking),
    );
  }
}
