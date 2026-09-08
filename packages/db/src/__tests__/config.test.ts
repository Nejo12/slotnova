import { describe, expect, it } from "vitest";

import { DbConfigError, resolveDbConfig } from "../config.js";

const APP_URL = "postgres://app:pw@db.example:5432/slotnova";
const MIGRATION_URL = "postgres://migrator:pw@db.example:5432/slotnova";

describe("resolveDbConfig", () => {
  it("selects the app URL for the app role and the migration URL for the migration role", () => {
    const env = { DATABASE_URL: APP_URL, DATABASE_MIGRATION_URL: MIGRATION_URL };
    expect(resolveDbConfig("app", env).connectionString).toBe(APP_URL);
    expect(resolveDbConfig("migration", env).connectionString).toBe(MIGRATION_URL);
  });

  it("throws a DbConfigError when the required connection string is absent (no implicit fallback)", () => {
    expect(() => resolveDbConfig("app", {})).toThrow(DbConfigError);
    expect(() => resolveDbConfig("migration", { DATABASE_URL: APP_URL })).toThrow(
      /DATABASE_MIGRATION_URL is required/,
    );
  });

  it("defaults the pool size by role and keeps the migration runner single-session", () => {
    const env = { DATABASE_URL: APP_URL, DATABASE_MIGRATION_URL: MIGRATION_URL };
    expect(resolveDbConfig("app", env).poolMax).toBe(10);
    expect(resolveDbConfig("migration", env).poolMax).toBe(1);
    expect(resolveDbConfig("app", { ...env, DATABASE_POOL_MAX: "25" }).poolMax).toBe(25);
  });

  it("parses SSL modes without any provider-specific branching", () => {
    const base = { DATABASE_URL: APP_URL };
    expect(resolveDbConfig("app", base).ssl).toBe(false);
    expect(resolveDbConfig("app", { ...base, DATABASE_SSL: "require" }).ssl).toEqual({
      rejectUnauthorized: true,
    });
    expect(resolveDbConfig("app", { ...base, DATABASE_SSL: "no-verify" }).ssl).toEqual({
      rejectUnauthorized: false,
    });
    expect(() => resolveDbConfig("app", { ...base, DATABASE_SSL: "sslmode=weird" })).toThrow(
      DbConfigError,
    );
  });

  it("rejects a non-numeric pool size", () => {
    expect(() =>
      resolveDbConfig("app", { DATABASE_URL: APP_URL, DATABASE_POOL_MAX: "lots" }),
    ).toThrow(DbConfigError);
  });

  it("leaves the statement timeout unset unless configured", () => {
    const env = { DATABASE_URL: APP_URL };
    expect(resolveDbConfig("app", env).statementTimeoutMillis).toBeUndefined();
    expect(
      resolveDbConfig("app", { ...env, DATABASE_STATEMENT_TIMEOUT_MS: "5000" })
        .statementTimeoutMillis,
    ).toBe(5000);
  });
});
