import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { SecurityConfigModule } from "./config/security-config.module.js";
import { ProblemExceptionFilter } from "./http/problem/problem.filter.js";
import { BookingModule } from "./modules/booking/booking.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { DatabaseModule } from "./modules/platform/database/database.module.js";
import { HealthModule } from "./modules/platform/health/health.module.js";
import { SecurityModule } from "./modules/platform/security/security.module.js";
import { TenancyModule } from "./modules/platform/tenancy/tenancy.module.js";
import { SchedulingModule } from "./modules/scheduling/scheduling.module.js";

/**
 * Root module. Phase 1's scope guard (FR-070) admitted only platform
 * foundation modules; Phase 2 adds product modules one bounded PR at a
 * time. `CatalogModule` joins here in PR-02 (issue #60) now that it has
 * controllers — PR-01 deliberately left it out while it had none, and
 * `SchedulingModule` joins in PR-04 (issue #66) for the same reason now that
 * PR-03's domain has a persistence/HTTP layer. `BookingModule` joins in PR-07
 * (issue #73) on the same terms — PR-05/PR-06 deliberately left it unwired
 * while it had no controller. No Calendar, Recovery or Payments module exists
 * yet.
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
    SchedulingModule,
    BookingModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
})
export class AppModule {}
