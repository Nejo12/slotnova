import { Module } from "@nestjs/common";

import { HealthCheckService } from "./health-check.service.js";
import { HealthController } from "./health.controller.js";

@Module({
  controllers: [HealthController],
  providers: [HealthCheckService],
})
export class HealthModule {}
