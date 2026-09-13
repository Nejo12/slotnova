import { Module } from "@nestjs/common";

import { CsrfController } from "./csrf.controller.js";

@Module({
  controllers: [CsrfController],
})
export class SecurityModule {}
