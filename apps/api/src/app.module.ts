import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { SecurityConfigModule } from "./config/security-config.module.js";
import { ProblemExceptionFilter } from "./http/problem/problem.filter.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { DatabaseModule } from "./modules/platform/database/database.module.js";
import { HealthModule } from "./modules/platform/health/health.module.js";
import { SecurityModule } from "./modules/platform/security/security.module.js";
import { TenancyModule } from "./modules/platform/tenancy/tenancy.module.js";

/**
 * Root module. Phase 1 scope guard (FR-070): only platform foundation
 * modules — no Booking/Scheduling/Catalog/Recovery/Payments/etc.
 */
@Module({
  imports: [
    SecurityConfigModule,
    DatabaseModule,
    TenancyModule,
    HealthModule,
    SecurityModule,
    IdentityModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
})
export class AppModule {}
