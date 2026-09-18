import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module.js";
import { CreateServiceCategoryUseCase } from "./application/create-service-category.use-case.js";
import { CreateServiceIdempotentlyUseCase } from "./application/create-service-idempotently.use-case.js";
import { CreateServiceUseCase } from "./application/create-service.use-case.js";
import { DeactivateServiceUseCase } from "./application/deactivate-service.use-case.js";
import {
  GetServiceUseCase,
  ListServiceCategoriesUseCase,
  ListServicesUseCase,
} from "./application/read-catalog.use-case.js";
import { ServiceSnapshotPort } from "./application/service-snapshot.port.js";
import { UpdateServiceUseCase } from "./application/update-service.use-case.js";
import { ServiceCategoriesController } from "./http/service-categories.controller.js";
import { ServicesController } from "./http/services.controller.js";
import { ServiceCategoriesRepository } from "./infrastructure/repositories/service-categories.repository.js";
import { ServicesRepository } from "./infrastructure/repositories/services.repository.js";

/**
 * `catalog` module (PR-01 domain/repository foundation + PR-02 HTTP layer,
 * issues #58/#60). PR-01 deliberately left this module unwired because it
 * had no controllers; PR-02 adds them and imports it into `AppModule`.
 *
 * `IdentityModule` is imported for `CapabilityGuard` only — the
 * server-authoritative authorization guard both controllers gate their
 * routes with (ADR-009). Nothing here reaches into identity's
 * application/infrastructure internals; the guard and `@RequireCapability`
 * are part of identity's exported public surface.
 *
 * Repositories stay providers of this module and are exported to nobody:
 * `index.ts` remains ports/types only, so no other module can acquire a
 * Catalog repository (constitution III).
 *
 * PR-07 (issue #73) adds exactly one `exports` entry:
 * {@link ServiceSnapshotPort}, the Catalog-owned seam Booking reads a
 * Service snapshot through while running on Booking's own idempotency
 * transaction. It is the only Catalog provider any other module can inject,
 * and `ServicesRepository` remains unexported — a consumer gets the
 * five-member snapshot or nothing.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ServicesController, ServiceCategoriesController],
  providers: [
    ServicesRepository,
    ServiceCategoriesRepository,
    CreateServiceUseCase,
    CreateServiceIdempotentlyUseCase,
    UpdateServiceUseCase,
    DeactivateServiceUseCase,
    CreateServiceCategoryUseCase,
    ListServicesUseCase,
    GetServiceUseCase,
    ListServiceCategoriesUseCase,
    ServiceSnapshotPort,
  ],
  exports: [ServiceSnapshotPort],
})
export class CatalogModule {}
