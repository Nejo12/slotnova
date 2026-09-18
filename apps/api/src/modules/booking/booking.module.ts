import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { BookingOccupancyPort } from "./application/booking-occupancy.port.js";
import { CancelBookingUseCase } from "./application/cancel-booking.use-case.js";
import { CompleteBookingUseCase } from "./application/complete-booking.use-case.js";
import { CreateBookingIdempotentlyUseCase } from "./application/create-booking-idempotently.use-case.js";
import { CreateBookingUseCase } from "./application/create-booking.use-case.js";
import { GetBookingUseCase, ListBookingsUseCase } from "./application/read-bookings.use-case.js";
import { RescheduleBookingUseCase } from "./application/reschedule-booking.use-case.js";
import { BookingsController } from "./http/bookings.controller.js";
import { BookingsRepository } from "./infrastructure/repositories/bookings.repository.js";

/**
 * `booking` module (PR-07, issue #73). PR-05 shipped the domain and PR-06 the
 * database overlap boundary, both with no NestJS module because neither had a
 * controller or a provider anything resolved; this PR adds the HTTP layer and
 * wires it into `AppModule`, following `CatalogModule` (PR-02) and
 * `SchedulingModule` (PR-04) exactly.
 *
 * ADR-012 core-module layering is respected end to end: `http` talks only to
 * `application`, `application` owns the transaction/tenant-context boundary
 * and talks to `infrastructure`, and the state machine stays in `domain`.
 *
 * `IdentityModule` is imported for `CapabilityGuard` only — the
 * server-authoritative authorization guard the controller gates its routes
 * with (ADR-009).
 *
 * `CatalogModule` is imported for exactly one thing: `ServiceSnapshotPort`,
 * the Catalog-owned public seam through which booking creation reads the
 * Service's `active` flag and snapshots its duration/buffers, on Booking's
 * own idempotency transaction. It is the only provider Catalog exports, and
 * nothing here reaches into `catalog/infrastructure/**` or issues a
 * cross-module join (constitution III, `no-cross-module-internals`). The
 * dependency runs one way: Catalog knows nothing about Booking.
 *
 * Repositories stay providers of this module and are exported to nobody:
 * `index.ts` remains the pure domain surface, so no other module can acquire
 * a Booking repository as a cross-domain shortcut. Calendar's
 * read-composition endpoint (PR-09) is where the first Booking read port, if
 * any, gets published — deliberately not "just in case" here.
 */
@Module({
  imports: [IdentityModule, CatalogModule],
  controllers: [BookingsController],
  providers: [
    BookingsRepository,
    ListBookingsUseCase,
    GetBookingUseCase,
    CreateBookingUseCase,
    CreateBookingIdempotentlyUseCase,
    RescheduleBookingUseCase,
    CancelBookingUseCase,
    CompleteBookingUseCase,
    BookingOccupancyPort,
  ],
  // The ONE provider another module may resolve: Calendar's occupancy read
  // seam (PR-09). Repositories and every other use case stay unexported.
  exports: [BookingOccupancyPort],
})
export class BookingModule {}
