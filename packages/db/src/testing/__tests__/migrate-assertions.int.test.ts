import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "pg";

import { runMigrations, SCHEMA_MIGRATIONS_TABLE } from "../../migrate.js";
import { withIsolatedDatabase } from "../isolation.js";
import { assertCleanMigration, assertForwardMigration } from "../migrate-assertions.js";
import { startPostgres, type PostgresHarness } from "../pg-container.js";

const VALID_MIGRATIONS = fileURLToPath(
  new URL("../../__fixtures__/migrations-valid", import.meta.url),
);

let harness: PostgresHarness;

beforeAll(async () => {
  harness = await startPostgres();
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

describe("migration test utilities (T012)", () => {
  it("asserts a clean-database apply of every migration, idempotently", async () => {
    const result = await assertCleanMigration({
      adminUri: harness.adminUri,
      migrationsDir: VALID_MIGRATIONS,
    });
    expect(result.appliedVersions).toEqual(["0001", "0002"]);
  });

  it("asserts a forward migration from a representative populated prior state", async () => {
    await assertForwardMigration<{ id: string }>({
      adminUri: harness.adminUri,
      migrationsDir: VALID_MIGRATIONS,
      stopBefore: "0002",
      seed: async (client) => {
        const { rows } = await client.query<{ id: string }>(
          "INSERT INTO public.widgets (label) VALUES ('seeded') RETURNING id",
        );
        const row = rows[0];
        if (!row) throw new Error("seed insert returned no row");
        // The 'color' column does not exist yet at this point.
        await expect(client.query("SELECT color FROM public.widgets")).rejects.toThrow(
          /column .*color.* does not exist/,
        );
        return { id: row.id };
      },
      verify: async (client, seeded) => {
        const { rows } = await client.query<{ id: string; label: string; color: string | null }>(
          "SELECT id, label, color FROM public.widgets WHERE id = $1",
          [seeded.id],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.label).toBe("seeded");
        expect(rows[0]?.color).toBeNull();
      },
    });
  });

  it("detects checksum drift on an already-applied migration", async () => {
    await withIsolatedDatabase(harness.adminUri, async ({ databaseUri }) => {
      await runMigrations({ connectionString: databaseUri, migrationsDir: VALID_MIGRATIONS });

      const client = new Client({ connectionString: databaseUri });
      await client.connect();
      try {
        await client.query(
          `UPDATE public.${SCHEMA_MIGRATIONS_TABLE} SET checksum = 'tampered' WHERE version = '0001'`,
        );
      } finally {
        await client.end();
      }

      await expect(
        runMigrations({ connectionString: databaseUri, migrationsDir: VALID_MIGRATIONS }),
      ).rejects.toThrow(/was modified after it was applied/);
    });
  });
});
