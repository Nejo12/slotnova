import { describe, expect, it } from "vitest";
import { resolveApiConfig } from "../environment-config.js";
const local = { SLOTNOVA_ENV: "local", DATABASE_URL: "postgres://app:placeholder@localhost/db" };
const hosted = {
  ...local,
  SLOTNOVA_ENV: "production",
  NODE_ENV: "production",
  DATABASE_SSL: "require",
  DATABASE_CONNECTION_MODE: "direct",
  API_CREDENTIAL_ADAPTER: "disabled",
  API_CORS_ALLOWED_ORIGINS: "https://app.example.test",
};
describe("API deployment boundary", () => {
  it.each(["local", "preview", "staging", "production"])("validates %s", (environment) => {
    expect(resolveApiConfig({ ...hosted, SLOTNOVA_ENV: environment }).environment).toBe(
      environment,
    );
  });
  it("requires environment and connection without leaking URL secrets", () => {
    expect(() => resolveApiConfig({ DATABASE_URL: local.DATABASE_URL })).toThrow("SLOTNOVA_ENV");
    expect(() => resolveApiConfig({ ...local, SLOTNOVA_ENV: "typo" })).toThrow("SLOTNOVA_ENV");
    expect(() => resolveApiConfig({ SLOTNOVA_ENV: "local" })).toThrow("DATABASE_URL");
    expect(() => resolveApiConfig({ ...local, DATABASE_URL: "https://sensitive.invalid" })).toThrow(
      "PostgreSQL",
    );
  });
  it.each([
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { SCHEDULER_MIGRATION_URL: "postgres://scheduler@db/db" },
    { API_CREDENTIAL_ADAPTER: "development" },
    { API_SECURE_COOKIES: "false" },
    { API_ENABLE_HSTS: "false" },
    { API_CORS_ALLOWED_ORIGINS: "*" },
    { API_CORS_ALLOWED_ORIGINS: "http://app.example.test" },
    { DATABASE_SSL: "no-verify" },
    { DATABASE_URL: "postgres://app:placeholder@db.invalid/db?sslmode=no-verify" },
    { DATABASE_CONNECTION_MODE: "transaction" },
    { DATABASE_MIGRATION_URL: "postgres://migration@db/db" },
    { API_RATE_LIMIT_AUTH_MAX: "0" },
    { API_RATE_LIMIT_WINDOW_MS: "NaN" },
    { API_SECURE_COOKIES: "off" },
    { API_PORT: "70000" },
    { API_TRUST_PROXY: "true" },
    { API_TRUST_PROXY: "0.0.0.0/0" },
  ])("rejects unsafe/malformed hosted configuration %j", (override) => {
    expect(() => resolveApiConfig({ ...hosted, ...override })).toThrow();
  });
  it("accepts explicit proxy networks rather than trusting arbitrary forwarded headers", () => {
    expect(resolveApiConfig({ ...hosted, API_TRUST_PROXY: "10.20.0.0/24" }).trustProxy).toEqual([
      "10.20.0.0/24",
    ]);
  });
});
