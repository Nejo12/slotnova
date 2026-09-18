/**
 * `POST /v1/bookings`'s whole server-side story, in ONE PostgreSQL
 * transaction (PR-07, issue #73, `contracts/booking.contract.md`).
 *
 * ## The transaction contract this exists to hold
 *
 * `platform/idempotency/executeIdempotently` supports exactly one shape: the
 * claim, the protected write, and the stored replay response all commit
 * inside a single transaction (see that module's header — a
 * split-transaction variant existed, was found unsafe by review, and was
 * removed). Booking creation needs FOUR things in that one transaction:
 *
 *   1. the idempotency claim                       — `executeIdempotently`
 *   2. the current Service read + active check     — {@link ServiceSnapshotPort}
 *   3. the `bookings` insert                       — `CreateBookingUseCase`
 *   4. the stored replay response                  — `executeIdempotently`
 *
 * All four run on the `tx` that `withWorkspaceContext` opens here and on
 * nothing else: `ServiceSnapshotPort.readInTransaction(tx, ...)` and
 * `CreateBookingUseCase.executeInTransaction(tx, ...)` both take the caller's
 * transaction rather than acquiring their own connection, which is what makes
 * the atomicity real rather than asserted. Nothing in this file opens a
 * second transaction, and no Catalog use case that would open one is called.
 *
 * Consequences that are the whole point, and must not be "optimized" away:
 * - a duplicate key can never produce a second `bookings` row, because a
 *   claim that loses the unique-index race never runs `fn` at all — and,
 *   critically, a replay therefore returns the stored `201` **before** any
 *   INSERT is attempted, so it cannot collide with the very booking it
 *   created under `bookings_no_overlap`;
 * - a failed creation (inactive Service, overlap, invalid snapshot) rolls the
 *   claim back with it, because they are the same transaction — a client that
 *   retries after a failure is not permanently locked out by a poisoned key;
 * - the Service read sees exactly the rows RLS exposes for this workspace, on
 *   this transaction, so a cross-workspace `serviceId` is indistinguishable
 *   from a nonexistent one.
 *
 * ## Why the response body is rendered by the caller
 *
 * The replayed body has to be byte-identical to the original, so the exact
 * HTTP response body is what gets persisted. The controller passes a `render`
 * callback: this file stays free of status codes and DTO shapes, and there is
 * still exactly one representation of the body (the controller's), never a
 * second one written just for replay. Same seam as
 * `CreateServiceIdempotentlyUseCase` (PR-02).
 *
 * ## Not here
 *
 * No availability/overlap pre-check: the `bookings_no_overlap` exclusion
 * constraint is the overlap authority (PR-06, ADR-011), and a check-then-
 * insert as the sole protection is a hard prohibition. No outbox event or
 * audit record: Phase 2 confirms no consumer (`research.md`, FR-027,
 * ADR-024).
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Temporal } from "@js-temporal/polyfill";
import type { Pool } from "@slotnova/db";

// The ONE cross-module import in `booking/`: Catalog's public entry point,
// never `catalog/infrastructure/**` (`no-cross-module-internals`). The brand
// conversion happens here, at the seam, rather than making Catalog's
// `ServiceId` part of Booking's own domain vocabulary (`domain/ids.ts`).
import { ServiceSnapshotPort, asServiceId } from "../../catalog/index.js";
import { DB_POOL } from "../../platform/database/database.tokens.js";
import {
  executeIdempotently,
  type ExecuteIdempotentlyResult,
  type StoredResponse,
} from "../../platform/idempotency/idempotent-execution.js";
import {
  withWorkspaceContext,
  type WorkspaceContext,
} from "../../platform/tenancy/with-workspace-context.js";
import type { ServiceReferenceId } from "../domain/ids.js";
import type { BookingRecord } from "../infrastructure/repositories/bookings.repository.js";
import { BookingServiceUnavailableError } from "./booking-application-errors.js";
import { CreateBookingUseCase } from "./create-booking.use-case.js";

/**
 * The stable operation scope for this endpoint. Idempotency uniqueness is
 * `(workspace_id, operation, idempotency_key)`, so this constant is what
 * keeps the same key independent across endpoints — and, because
 * `workspace_id` is part of the key, independent across workspaces too.
 * Named `booking.create` rather than `booking.create_booking`: Catalog's
 * `catalog.create_service` disambiguates between Catalog's two creatable
 * entities, and Booking has exactly one.
 */
export const CREATE_BOOKING_OPERATION = "booking.create";

export interface IdempotentBookingCreation {
  readonly idempotencyKey: string;
  /** Digest of the request payload AFTER runtime-schema parsing/normalization. */
  readonly requestFingerprint: string;
}

/**
 * EXACTLY what the accepted contract lets a caller send. There is no
 * duration, buffer, status, version, blocking range, client, resource,
 * location or staff member here, and no way to add one at the boundary: the
 * snapshot is read from Catalog below, and `confirmed`/version 1 are the
 * aggregate's decision.
 */
export interface CreateBookingRequest {
  readonly serviceId: ServiceReferenceId;
  readonly startsAt: Temporal.Instant;
}

@Injectable()
export class CreateBookingIdempotentlyUseCase {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly serviceSnapshots: ServiceSnapshotPort,
    private readonly createBooking: CreateBookingUseCase,
  ) {}

  async execute(
    context: WorkspaceContext,
    request: CreateBookingRequest,
    idempotency: IdempotentBookingCreation,
    render: (booking: BookingRecord) => StoredResponse,
  ): Promise<ExecuteIdempotentlyResult> {
    return withWorkspaceContext(this.pool, context, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: context.workspaceId,
          operation: CREATE_BOOKING_OPERATION,
          idempotencyKey: idempotency.idempotencyKey,
          requestFingerprint: idempotency.requestFingerprint,
        },
        async () => {
          // Same `tx`. Not a Catalog transaction, not a second pooled
          // connection, not a cross-module SQL join — Catalog's own port,
          // running on the transaction this call owns.
          const service = await this.serviceSnapshots.readInTransaction(
            tx,
            asServiceId(request.serviceId),
          );
          if (service === null) {
            throw new BookingServiceUnavailableError(request.serviceId, "unavailable");
          }
          if (!service.active) {
            throw new BookingServiceUnavailableError(request.serviceId, "inactive");
          }

          return render(
            await this.createBooking.executeInTransaction(tx, context, {
              serviceId: request.serviceId,
              startsAt: request.startsAt,
              // Server-derived, every time. The caller cannot supply,
              // influence or override any of these three.
              serviceDurationMinutes: service.durationMinutes,
              preBufferMinutes: service.preBufferMinutes,
              postBufferMinutes: service.postBufferMinutes,
            }),
          );
        },
      ),
    );
  }
}
