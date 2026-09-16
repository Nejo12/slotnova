import { afterEach, describe, expect, it } from "vitest";

import { installNetworkDenylist } from "../deny-network.js";

describe("installNetworkDenylist", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("blocks a real fetch() to a non-local host with a clear error", async () => {
    ({ restore } = installNetworkDenylist());
    await expect(fetch("https://example.com/definitely-not-mocked")).rejects.toThrow(
      /NetworkDenylistError/,
    );
  });

  it("does not block fetch() to 127.0.0.1", async () => {
    ({ restore } = installNetworkDenylist());
    // A connection refused error (no server listening) proves the denylist
    // let the attempt through to the real network stack instead of blocking
    // it pre-emptively -- it must NOT throw NetworkDenylistError.
    await expect(fetch("http://127.0.0.1:1")).rejects.not.toThrow(/NetworkDenylistError/);
  });

  it("does not block fetch() to localhost", async () => {
    ({ restore } = installNetworkDenylist());
    await expect(fetch("http://localhost:1")).rejects.not.toThrow(/NetworkDenylistError/);
  });

  it("restore() returns fetch to its original, unpatched behavior", async () => {
    const originalFetch = globalThis.fetch;
    ({ restore } = installNetworkDenylist());
    expect(globalThis.fetch).not.toBe(originalFetch);
    restore();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
