import { describe, expect, it } from "vitest";

import { generateOpaqueSessionToken, hashSessionToken } from "../session-token.js";

describe("session-token", () => {
  it("generates a fresh, high-entropy raw token every call", () => {
    const a = generateOpaqueSessionToken();
    const b = generateOpaqueSessionToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashes deterministically -- same raw token always hashes to the same value", () => {
    const raw = generateOpaqueSessionToken();
    expect(hashSessionToken(raw)).toEqual(hashSessionToken(raw));
  });

  it("hashes different raw tokens to different values", () => {
    const a = generateOpaqueSessionToken();
    const b = generateOpaqueSessionToken();
    expect(hashSessionToken(a)).not.toEqual(hashSessionToken(b));
  });

  it("produces a value shaped like a Postgres uuid column input", () => {
    const hash = hashSessionToken(generateOpaqueSessionToken());
    expect(hash).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("never returns the raw token as its own hash", () => {
    const raw = generateOpaqueSessionToken();
    expect(hashSessionToken(raw)).not.toEqual(raw);
  });
});
