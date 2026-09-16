import { Module } from "@nestjs/common";

import { CreateServiceCategoryUseCase } from "./application/create-service-category.use-case.js";
import { CreateServiceUseCase } from "./application/create-service.use-case.js";
import { DeactivateServiceUseCase } from "./application/deactivate-service.use-case.js";
import { UpdateServiceUseCase } from "./application/update-service.use-case.js";
import { ServiceCategoriesRepository } from "./infrastructure/repositories/service-categories.repository.js";
import { ServicesRepository } from "./infrastructure/repositories/services.repository.js";

/**
 * `catalog` module domain/repository foundation (Phase 2 PR-01, issue #58).
 * No controllers — the HTTP/contracts layer is PR-02. Not yet imported into
 * `AppModule`: registering routeless providers ahead of any consumer would
 * be premature; PR-02 wires this module in alongside its controllers.
 */
@Module({
  providers: [
    ServicesRepository,
    ServiceCategoriesRepository,
    CreateServiceUseCase,
    UpdateServiceUseCase,
    DeactivateServiceUseCase,
    CreateServiceCategoryUseCase,
  ],
  exports: [
    ServicesRepository,
    ServiceCategoriesRepository,
    CreateServiceUseCase,
    UpdateServiceUseCase,
    DeactivateServiceUseCase,
    CreateServiceCategoryUseCase,
  ],
})
export class CatalogModule {}
