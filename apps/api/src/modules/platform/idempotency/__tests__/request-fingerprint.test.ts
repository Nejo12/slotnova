import { describe, expect, it } from "vitest";

import { canonicalize, fingerprintRequest } from "../request-fingerprint.js";

describe("canonicalize", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalize({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    expect(canonicalize({ z: { y: 1, x: 2 }, a: 1 })).toEqual({ a: 1, z: { x: 2, y: 1 } });
  });

  it("preserves array element order", () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("canonicalizes objects inside arrays", () => {
    expect(canonicalize([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }]);
  });
});

describe("fingerprintRequest (canonical request fingerprinting, issue #61)", () => {
  it("produces a 64-character lowercase hex sha256 digest", () => {
    const digest = fingerprintRequest({ name: "Haircut" });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the exact same value", () => {
    const value = { name: "Haircut", durationMinutes: 30 };
    expect(fingerprintRequest(value)).toBe(fingerprintRequest(value));
  });

  it("is identical for semantically-equal requests with different key order", () => {
    const a = {
      name: "Haircut",
      durationMinutes: 30,
      price: { amountMinor: 4000, currency: "GBP" },
    };
    const b = {
      price: { currency: "GBP", amountMinor: 4000 },
      durationMinutes: 30,
      name: "Haircut",
    };
    expect(fingerprintRequest(a)).toBe(fingerprintRequest(b));
  });

  it("differs when a materially different value is supplied", () => {
    const a = { name: "Haircut", durationMinutes: 30 };
    const b = { name: "Haircut", durationMinutes: 45 };
    expect(fingerprintRequest(a)).not.toBe(fingerprintRequest(b));
  });

  it("differs for array-order-sensitive payloads", () => {
    const a = { tags: ["a", "b"] };
    const b = { tags: ["b", "a"] };
    expect(fingerprintRequest(a)).not.toBe(fingerprintRequest(b));
  });

  it("distinguishes nested structural differences", () => {
    const a = { service: { categoryId: "1", name: "X" } };
    const b = { service: { categoryId: "2", name: "X" } };
    expect(fingerprintRequest(a)).not.toBe(fingerprintRequest(b));
  });
});
