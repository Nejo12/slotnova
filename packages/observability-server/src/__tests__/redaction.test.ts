import { describe, expect, it } from "vitest";

import { REDACTED, redact } from "../redaction.js";

describe("redact", () => {
  it("replaces a top-level sensitive value with the constant marker", () => {
    expect(redact({ password: "hunter2", user: "ada" })).toEqual({
      password: REDACTED,
      user: "ada",
    });
  });

  it("matches sensitive key names case-insensitively and across separators", () => {
    const out = redact({
      Password: "p",
      "ACCESS-TOKEN": "a",
      refresh_token: "r",
      "X-Api-Key": "k",
      Authorization: "Bearer x",
      clientSecret: "s",
      csrfToken: "c",
    });
    expect(out).toEqual({
      Password: REDACTED,
      "ACCESS-TOKEN": REDACTED,
      refresh_token: REDACTED,
      "X-Api-Key": REDACTED,
      Authorization: REDACTED,
      clientSecret: REDACTED,
      csrfToken: REDACTED,
    });
  });

  it("redacts PAN-like and card-verification fields", () => {
    expect(redact({ cardNumber: "4111111111111111", pan: "4111", cvv: "123", cvc: "456" })).toEqual(
      { cardNumber: REDACTED, pan: REDACTED, cvv: REDACTED, cvc: REDACTED },
    );
  });

  it("does not over-match innocuous keys that merely contain a sensitive substring", () => {
    expect(redact({ company: "acme", tokenCount: 3, description: "ok" })).toEqual({
      company: "acme",
      tokenCount: 3,
      description: "ok",
    });
  });

  it("redacts sensitive fields nested inside objects", () => {
    const out = redact({ a: { b: { authorization: "secret", keep: 1 } } });
    expect(out).toEqual({ a: { b: { authorization: REDACTED, keep: 1 } } });
  });

  it("redacts sensitive fields nested inside arrays", () => {
    const out = redact({ items: [{ token: "t1" }, { token: "t2", id: 9 }] });
    expect(out).toEqual({ items: [{ token: REDACTED }, { token: REDACTED, id: 9 }] });
  });

  it("does not mutate the caller-owned input (deep)", () => {
    const input = { password: "p", nested: { apiKey: "k" }, list: [{ secret: "s" }] };
    const snapshot = structuredClone(input);
    redact(input);
    expect(input).toEqual(snapshot);
  });

  it("is circular-reference safe and marks the cycle deterministically", () => {
    const input: Record<string, unknown> = { name: "root" };
    input["self"] = input;
    const out = redact(input) as Record<string, unknown>;
    expect(out["name"]).toBe("root");
    expect(out["self"]).toBe("[CIRCULAR]");
  });

  it("fully redacts a shared (non-circular) reference used more than once", () => {
    const shared = { apiKey: "k" };
    const out = redact({ a: shared, b: shared }) as Record<string, unknown>;
    expect(out["a"]).toEqual({ apiKey: REDACTED });
    expect(out["b"]).toEqual({ apiKey: REDACTED });
  });

  it("represents Error values without a stack by default", () => {
    const err = new Error("boom with /path?token=abc in it");
    const out = redact({ err }) as { err: Record<string, unknown> };
    expect(out.err).toEqual({ name: "Error", message: "boom with /path?token=abc in it" });
    expect(out.err["stack"]).toBeUndefined();
  });

  it("includes the Error stack only when explicitly opted in", () => {
    const err = new Error("boom");
    const out = redact({ err }, { includeErrorStack: true }) as {
      err: Record<string, unknown>;
    };
    expect(typeof out.err["stack"]).toBe("string");
  });

  it("accepts caller-supplied additional sensitive key names", () => {
    expect(redact({ ssn: "123-45-6789" }, { additionalKeys: ["ssn"] })).toEqual({
      ssn: REDACTED,
    });
  });

  it("passes primitives through unchanged", () => {
    expect(redact(42)).toBe(42);
    expect(redact("plain")).toBe("plain");
    expect(redact(null)).toBe(null);
  });
});
