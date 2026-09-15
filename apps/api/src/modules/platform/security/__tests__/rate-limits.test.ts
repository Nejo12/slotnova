import { describe, expect, it } from "vitest";
import { RequestRateLimits } from "../rate-limits.js";
const config = { authMax: 20, previewMax: 20, windowMs: 60000, maxKeys: 10000 };
describe("bounded process-local rate limits", () => {
  it("preserves independent per-token/per-IP limits and expires windows", () => {
    const limiter = new RequestRateLimits(config);
    for (let i = 0; i < 20; i++) expect(limiter.check(["ip:a", "token:a"], 20, 1)).toBe(0);
    expect(limiter.check(["ip:a", "token:a"], 20, 1)).toBe(60);
    expect(limiter.check(["ip:b", "token:a"], 20, 1)).toBe(60);
    expect(limiter.check(["ip:a", "token:b"], 20, 1)).toBe(60);
    expect(limiter.check(["ip:b", "token:b"], 20, 1)).toBe(0);
    expect(limiter.check(["ip:a", "token:a"], 20, 60002)).toBe(0);
  });
  it("fails closed at capacity, then frees expired keys without extending rejected windows", () => {
    const limiter = new RequestRateLimits({ ...config, maxKeys: 1 });
    expect(limiter.check(["a"], 1, 0)).toBe(0);
    expect(limiter.check(["b"], 1, 1)).toBe(60);
    expect(limiter.check(["a"], 1, 59000)).toBe(1);
    expect(limiter.check(["b"], 1, 60000)).toBe(0);
  });
});
