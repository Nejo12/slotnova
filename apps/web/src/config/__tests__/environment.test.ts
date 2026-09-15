import { describe, expect, it } from "vitest";
import { resolveWebConfig } from "../environment.js";
describe("public web build configuration", () => {
  it.each(["local", "preview", "staging", "production"])(
    "accepts explicit %s with same-origin API",
    (environment) => {
      expect(resolveWebConfig({ SLOTNOVA_ENV: environment, VITE_API_URL: "" }).apiUrl).toBe("");
    },
  );
  it.each([
    {},
    { SLOTNOVA_ENV: "typo" },
    { SLOTNOVA_ENV: "production" },
    { SLOTNOVA_ENV: "production", VITE_API_URL: "", VITE_E2E: "true" },
    { SLOTNOVA_ENV: "local", VITE_API_URL: "javascript:alert(1)" },
    { SLOTNOVA_ENV: "local", VITE_DATABASE_PASSWORD: "placeholder" },
  ])("rejects missing or unsafe build settings %j", (env) =>
    expect(() => resolveWebConfig(env)).toThrow(),
  );
});
