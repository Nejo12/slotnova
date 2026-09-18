import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module.js";
import { CreateAvailabilityExceptionUseCase } from "./application/create-availability-exception.use-case.js";
import { CreateAvailabilityPatternUseCase } from "./application/create-availability-pattern.use-case.js";
import { ListAvailabilityPatternsUseCase } from "./application/list-availability-patterns.use-case.js";
import { AvailabilityReadPort } from "./application/availability-read.port.js";
import { ResolveAvailabilityUseCase } from "./application/resolve-availability.use-case.js";
import { SchedulingController } from "./http/scheduling.controller.js";
import { AvailabilityExceptionsRepository } from "./infrastructure/repositories/availability-exceptions.repository.js";
import { AvailabilityPatternsRepository } from "./infrastructure/repositories/availability-patterns.repository.js";

/**
 * `scheduling` module (PR-04, issue #66). PR-03 shipped the pure domain with
 * no NestJS module because it had no controllers or providers; this PR adds
 * the persistence/application/HTTP layers and wires it into `AppModule`,
 * following `CatalogModule`'s precedent exactly.
 *
 * ADR-012 core-module layering is respected end to end: `http` talks only to
 * `application`, `application` owns the transaction/tenant-context boundary
 * and talks to `infrastructure`, and all recurrence/DST/interval reasoning
 * stays in `domain`.
 *
 * `IdentityModule` is imported for `CapabilityGuard` only — the
 * server-authoritative authorization guard the controller gates its routes
 * with (ADR-009). Nothing here reaches into identity's application/
 * infrastructure internals; the guard and `@RequireCapability` are part of
 * identity's exported public surface.
 *
 * Repositories stay providers of this module and are exported to nobody:
 * `index.ts` remains domain/ports only, so no other module can acquire a
 * Scheduling repository as a cross-domain shortcut (constitution III,
 * enforced by `no-cross-module-internals`). No Booking, Calendar or Catalog
 * module is imported, and none is referenced anywhere under
 * `modules/scheduling/`.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SchedulingController],
  providers: [
    AvailabilityPatternsRepository,
    AvailabilityExceptionsRepository,
    ListAvailabilityPatternsUseCase,
    CreateAvailabilityPatternUseCase,
    CreateAvailabilityExceptionUseCase,
    ResolveAvailabilityUseCase,
    AvailabilityReadPort,
  ],
  // The ONE provider another module may resolve: Calendar's read seam
  // (PR-09). Repositories and every other use case stay unexported, so no
  // sibling module can acquire a Scheduling repository as a shortcut.
  exports: [AvailabilityReadPort],
})
export class SchedulingModule {}
