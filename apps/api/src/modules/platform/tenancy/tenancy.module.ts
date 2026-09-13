import { Module } from "@nestjs/common";

import { WorkspaceContextService } from "./workspace-context.service.js";

@Module({
  providers: [WorkspaceContextService],
  exports: [WorkspaceContextService],
})
export class TenancyModule {}
