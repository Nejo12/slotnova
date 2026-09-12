import { Inject, Injectable } from "@nestjs/common";
import { loadMigrations, type Pool } from "@slotnova/db";

import { DB_POOL } from "../database/database.tokens.js";

export type CheckStatus = "ok" | "down";
export type MigrationsStatus = "current" | "pending" | "unknown";

export interface ReadinessChecks {
  readonly database: CheckStatus;
  readonly migrations: MigrationsStatus;
  readonly outbox: CheckStatus;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly checks: ReadinessChecks;
}

/**
 * Readiness checks for `GET /readyz` (T023, contracts/health.contract.md).
 * Deliberately conservative on failure: any check that cannot be proven
 * healthy degrades to its failure value rather than throwing — the
 * controller/filter layer is what turns "not ready" into a `problem+json`
 * 503 with no internal detail leaked.
 */
@Injectable()
export class HealthCheckService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async checkReadiness(): Promise<ReadinessResult> {
    const checks: { database: CheckStatus; migrations: MigrationsStatus; outbox: CheckStatus } = {
      database: "down",
      migrations: "unknown",
      outbox: "down",
    };

    let client;
    try {
      client = await this.pool.connect();
    } catch {
      return { ready: false, checks };
    }

    try {
      await client.query("SELECT 1");
      checks.database = "ok";

      try {
        const applied = await client.query<{ version: string }>(
          "SELECT version FROM public.schema_migrations",
        );
        const appliedVersions = new Set(applied.rows.map((row) => row.version));
        const all = await loadMigrations();
        checks.migrations = all.every((migration) => appliedVersions.has(migration.version))
          ? "current"
          : "pending";
      } catch {
        checks.migrations = "unknown";
      }

      try {
        await client.query("SELECT 1 FROM public.outbox_records LIMIT 1");
        checks.outbox = "ok";
      } catch {
        checks.outbox = "down";
      }
    } catch {
      // database check itself failed; migrations/outbox stay at their defaults.
    } finally {
      client.release();
    }

    const ready =
      checks.database === "ok" && checks.migrations === "current" && checks.outbox === "ok";
    return { ready, checks };
  }
}
