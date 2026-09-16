import { describe, expect, it } from "vitest";

// Deliberately does NOT set up an MSW server -- this test proves the global
// denylist (wired via vitest.config.ts setupFiles) catches a raw, completely
// unmocked outbound call on its own, independent of MSW.
describe("global network denylist (no MSW server in this file)", () => {
  it("blocks a real, un-mocked call to what would be a provider endpoint", async () => {
    await expect(fetch("https://api.stripe.com/v1/charges")).rejects.toThrow(
      /NetworkDenylistError/,
    );
  });
});
