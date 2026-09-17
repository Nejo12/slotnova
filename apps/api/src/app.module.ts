import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { SecurityConfigModule } from "./config/security-config.module.js";
import { ProblemExceptionFilter } from "./http/problem/problem.filter.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { DatabaseModule } from "./modules/platform/database/database.module.js";
import { HealthModule } from "./modules/platform/health/health.module.js";
import { SecurityModule } from "./modules/platform/security/security.module.js";
import { TenancyModule } from "./modules/platform/tenancy/tenancy.module.js";

/**
 * Root module. Phase 1's scope guard (FR-070) admitted only platform
 * foundation modules; Phase 2 adds product modules one bounded PR at a
 * time. `CatalogModule` joins here in PR-02 (issue #60) now that it has
 * controllers — PR-01 deliberately left it out while it had none. No
 * Scheduling/Booking/Recovery/Payments module exists yet.
 */
@Module({
  imports: [
    SecurityConfigModule,
    DatabaseModule,
    TenancyModule,
    HealthModule,
    SecurityModule,
    IdentityModule,
    CatalogModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
})
export class AppModule {}
