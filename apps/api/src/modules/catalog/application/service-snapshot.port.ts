/**
 * Catalog's deliberate public port for "what does Booking need to know about
 * a Service at the moment a Booking is created?" (PR-07, issue #73,
 * `contracts/booking.contract.md`: "duration/buffers snapshotted server-side
 * from the current Service").
 *
 * ## Why this file exists at all
 *
 * Booking must snapshot the Service's duration and buffers, and must do it
 * INSIDE the same PostgreSQL transaction that places the idempotency claim
 * and inserts the `bookings` row — that is the only shape
 * `platform/idempotency/executeIdempotently` supports (see its header). A
 * direct `catalog/infrastructure/repositories/services.repository.js` import
 * from Booking is a hard prohibition (constitution III, dependency-cruiser
 * `no-cross-module-internals`), and a cross-module SQL join is equally
 * forbidden. So Catalog owns and publishes this port; Booking consumes it
 * through `catalog/index.ts` and never learns that `public.services` exists.
 *
 * ## Why it takes the caller's transaction
 *
 * `readInTransaction` takes the `Queryable` the caller already owns rather
 * than opening its own — exactly the seam
 * `CreateServiceUseCase.executeInTransaction` established in PR-02 for the
 * same reason. Opening a second transaction (or grabbing a second pooled
 * connection) would mean the Service read, the Booking insert and the
 * idempotency completion were no longer atomic, which is precisely the
 * failure mode PR-02A's review removed the split-transaction design to
 * prevent. There is deliberately no `execute(context, ...)` convenience
 * overload here: no caller needs one, and offering it would make the unsafe
 * usage the easy one.
 *
 * ## Why the snapshot is this small
 *
 * EXACTLY the five members Booking needs: the id it echoes back, `active`
 * (creation requires a bookable Service), and the three snapshotted minute
 * values. No name, price, category or any other Catalog concept crosses the
 * boundary — a port that returned `ServiceRecord` would quietly make every
 * future Catalog column part of Booking's vocabulary, and `price` in
 * particular has no business being reachable from the Booking module.
 *
 * `null` covers "no such service", "another workspace's service" and nothing
 * else: the read runs under the caller's RLS-scoped transaction, so those two
 * are indistinguishable by construction and no caller can probe for another
 * tenant's Service through this port.
 */
import { Injectable } from "@nestjs/common";
import type { Queryable } from "@slotnova/db";

import type { ServiceId } from "../domain/ids.js";
import { ServicesRepository } from "../infrastructure/repositories/services.repository.js";

/** The minimum a Booking needs from a Service. Nothing else may be added without a proven consumer. */
export interface ServiceSnapshot {
  readonly id: ServiceId;
  readonly active: boolean;
  readonly durationMinutes: number;
  readonly preBufferMinutes: number;
  readonly postBufferMinutes: number;
}

@Injectable()
export class ServiceSnapshotPort {
  constructor(private readonly services: ServicesRepository) {}

  /**
   * Reads the current Service on the caller's own transaction. `null` when
   * the active workspace cannot see that id.
   */
  async readInTransaction(tx: Queryable, id: ServiceId): Promise<ServiceSnapshot | null> {
    const record = await this.services.findById(tx, id);
    if (record === null) return null;
    return {
      id: record.id,
      active: record.active,
      durationMinutes: record.durationMinutes,
      preBufferMinutes: record.preBufferMinutes,
      postBufferMinutes: record.postBufferMinutes,
    };
  }
}
