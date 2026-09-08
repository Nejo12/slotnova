import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checksumOf, loadMigrations, MigrationError, runMigrations } from "../migrate.js";

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));

describe("loadMigrations", () => {
  it("loads and orders valid migrations by version", async () => {
    const migrations = await loadMigrations(fixture("migrations-valid"));
    expect(migrations.map((m) => m.version)).toEqual(["0001", "0002"]);
    expect(migrations[0]?.name).toBe("create_widgets");
    expect(migrations.every((m) => m.runInTransaction)).toBe(true);
  });

  it("computes a stable, line-ending-normalised checksum", async () => {
    const migrations = await loadMigrations(fixture("migrations-valid"));
    const first = migrations[0];
    expect(first?.checksum).toBe(checksumOf(first?.sql ?? ""));
    expect(checksumOf("SELECT 1;\n")).toBe(checksumOf("SELECT 1;\r\n"));
  });

  it("rejects a filename that breaks the NNNN_snake_case_name.sql convention", async () => {
    await expect(loadMigrations(fixture("migrations-bad-name"))).rejects.toThrow(MigrationError);
  });

  it("rejects a duplicate migration version", async () => {
    await expect(loadMigrations(fixture("migrations-duplicate"))).rejects.toThrow(
      /duplicate migration version/,
    );
  });

  it("rejects an empty migration file", async () => {
    await expect(loadMigrations(fixture("migrations-empty"))).rejects.toThrow(/is empty/);
  });

  it("throws when the migrations directory does not exist", async () => {
    await expect(loadMigrations(fixture("migrations-does-not-exist"))).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe("runMigrations", () => {
  it("refuses to run without a client or connection string", async () => {
    await expect(runMigrations({})).rejects.toThrow(/no implicit connection/);
  });

  it("refuses both a client and a connection string", async () => {
    await expect(
      runMigrations({
        connectionString: "postgres://x/y",
        client: {} as never,
      }),
    ).rejects.toThrow(/not both/);
  });
});
