import { describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../security-config.js";

describe("resolveSecurityConfig", () => {
  it("defaults to no allowed CORS origins (fail closed, not '*')", () => {
    const config = resolveSecurityConfig({});
    expect(config.corsOrigins).toEqual([]);
  });

  it("parses a comma-separated allowlist, trimming whitespace and blanks", () => {
    const config = resolveSecurityConfig({
      API_CORS_ALLOWED_ORIGINS: "https://app.slotnova.test, https://admin.slotnova.test ,,",
    });
    expect(config.corsOrigins).toEqual([
      "https://app.slotnova.test",
      "https://admin.slotnova.test",
    ]);
  });

  it("enables HSTS by default", () => {
    expect(resolveSecurityConfig({}).enableHsts).toBe(true);
  });

  it("disables HSTS only when explicitly set to 'false'", () => {
    expect(resolveSecurityConfig({ API_ENABLE_HSTS: "false" }).enableHsts).toBe(false);
    expect(resolveSecurityConfig({ API_ENABLE_HSTS: "FALSE" }).enableHsts).toBe(false);
    expect(resolveSecurityConfig({ API_ENABLE_HSTS: "true" }).enableHsts).toBe(true);
  });
});
