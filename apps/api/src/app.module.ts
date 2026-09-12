import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ProblemExceptionFilter } from "./http/problem/problem.filter.js";
import { DatabaseModule } from "./modules/platform/database/database.module.js";
import { HealthModule } from "./modules/platform/health/health.module.js";
import { TenancyModule } from "./modules/platform/tenancy/tenancy.module.js";

/**
 * Root module. Phase 1 scope guard (FR-070): only platform foundation
 * modules — no Booking/Scheduling/Catalog/Recovery/Payments/etc.
 */
@Module({
  imports: [DatabaseModule, TenancyModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: ProblemExceptionFilter }],
})
export class AppModule {}
