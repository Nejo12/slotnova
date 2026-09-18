import { Module } from "@nestjs/common";

import { BookingModule } from "../booking/booking.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { SchedulingModule } from "../scheduling/scheduling.module.js";
import { ComposeCalendarUseCase } from "./application/compose-calendar.use-case.js";
import { CalendarController } from "./http/calendar.controller.js";

/**
 * `calendar-read` module (PR-09, issue #81).
 *
 * Deliberately named `calendar-read`, not `calendar`: Calendar is NOT a
 * backend bounded context (ADR-012, `research.md` R-CAL). This module has
 * `application/` and `http/` and NOTHING ELSE — no `domain/`, because it
 * owns no invariant; no `infrastructure/`, because it owns no row. There is
 * no Calendar table, no migration, no repository, no outbox event and no
 * job. If a future PR ever needs one of those, that is the signal that the
 * design has drifted, not that this directory should quietly grow a
 * persistence layer.
 *
 * It imports the two sibling modules whose published READ PORTS it composes
 * — `AvailabilityReadPort` from `SchedulingModule` and
 * `BookingOccupancyPort` from `BookingModule`, the only provider each of
 * them exports. Nothing here reaches into either module's
 * application/infrastructure internals or queries their tables
 * (constitution III, `no-cross-module-internals`), and the dependency runs
 * one way: neither Scheduling nor Booking knows Calendar exists.
 *
 * `IdentityModule` is imported for `CapabilityGuard` only, exactly as every
 * other product module imports it.
 */
@Module({
  imports: [IdentityModule, SchedulingModule, BookingModule],
  controllers: [CalendarController],
  providers: [ComposeCalendarUseCase],
})
export class CalendarReadModule {}
