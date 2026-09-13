import { describe, expect, it } from "vitest";

import { resolveSecurityConfig, SecurityConfigError } from "../security-config.js";

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

  describe("CORS wildcard/malformed-origin hardening (review correction)", () => {
    it("rejects a bare wildcard origin", () => {
      expect(() => resolveSecurityConfig({ API_CORS_ALLOWED_ORIGINS: "*" })).toThrow(
        SecurityConfigError,
      );
    });

    it("rejects a wildcard mixed in among otherwise-valid origins -- one bad entry poisons the whole allowlist", () => {
      expect(() =>
        resolveSecurityConfig({
          API_CORS_ALLOWED_ORIGINS: "https://app.slotnova.test,*",
        }),
      ).toThrow(SecurityConfigError);
    });

    it("a wildcard configuration can never reach a returned config, so it can never reach credentials:true", () => {
      // `main.ts` gates `credentials: true` on `corsOrigins.length > 0` and
      // passes `corsOrigins` straight to the CORS `origin` allowlist -- the
      // only way a wildcard could ever reach that call is via a
      // `SecurityConfig` this function returned. Proving `resolveSecurityConfig`
      // itself throws for every wildcard-bearing input closes that path
      // entirely, independent of how any future caller uses the result.
      let config: unknown;
      try {
        config = resolveSecurityConfig({ API_CORS_ALLOWED_ORIGINS: "*" });
      } catch {
        config = undefined;
      }
      expect(config).toBeUndefined();
    });

    it("rejects malformed origin values: a path, a trailing slash, a bare host, and a non-http(s) scheme", () => {
      const malformed = [
        "https://app.slotnova.test/path",
        "https://app.slotnova.test/",
        "app.slotnova.test",
        "ftp://app.slotnova.test",
        "https://",
        "not a url at all",
      ];
      for (const value of malformed) {
        expect(
          () => resolveSecurityConfig({ API_CORS_ALLOWED_ORIGINS: value }),
          `expected ${JSON.stringify(value)} to be rejected`,
        ).toThrow(SecurityConfigError);
      }
    });

    it("still accepts well-formed origins, including a port and localhost for dev", () => {
      const config = resolveSecurityConfig({
        API_CORS_ALLOWED_ORIGINS: "https://app.slotnova.test,http://localhost:5173",
      });
      expect(config.corsOrigins).toEqual(["https://app.slotnova.test", "http://localhost:5173"]);
    });
  });

  it("enables HSTS by default", () => {
    expect(resolveSecurityConfig({}).enableHsts).toBe(true);
  });

  it("disables HSTS only when explicitly set to 'false'", () => {
    expect(resolveSecurityConfig({ API_ENABLE_HSTS: "false" }).enableHsts).toBe(false);
    expect(resolveSecurityConfig({ API_ENABLE_HSTS: "FALSE" }).enableHsts).toBe(false);
    expect(resolveSecurityConfig({ API_ENABLE_HSTS: "true" }).enableHsts).toBe(true);
  });

  it("defaults secure cookies on (Secure + __Host- eligible)", () => {
    expect(resolveSecurityConfig({}).secureCookies).toBe(true);
  });

  it("disables secure cookies only when explicitly set to 'false' (local dev over http)", () => {
    expect(resolveSecurityConfig({ API_SECURE_COOKIES: "false" }).secureCookies).toBe(false);
    expect(resolveSecurityConfig({ API_SECURE_COOKIES: "FALSE" }).secureCookies).toBe(false);
    expect(resolveSecurityConfig({ API_SECURE_COOKIES: "true" }).secureCookies).toBe(true);
  });
});
