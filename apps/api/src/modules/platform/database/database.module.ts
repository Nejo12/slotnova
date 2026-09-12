import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { createPool, type Pool } from "@slotnova/db";

import { DB_POOL } from "./database.tokens.js";

/**
 * Provides the single shared `app`-role connection pool (`@slotnova/db`,
 * ADR-004/ADR-008 — never `BYPASSRLS`, never superuser). Global so any
 * platform/module provider can inject {@link DB_POOL} without a repeated
 * import; the pool itself is created once per process and closed on
 * shutdown.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      useFactory: (): Pool => createPool("app"),
    },
  ],
  exports: [DB_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
