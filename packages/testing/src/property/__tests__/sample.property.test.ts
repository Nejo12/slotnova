import { describe, expect, it } from "vitest";

import { fc, describeReproduction, propertyParameters } from "../index.js";

/**
 * Non-domain sample properties that prove the fast-check wiring runs in the fast
 * lane and that seeds are deterministic. Real Slotnova arbitraries are out of
 * scope for this PR (task T015).
 */
/** JSON has no negative-zero literal, so `-0` (anywhere in the structure) legitimately round-trips to `+0`. */
function containsNegativeZero(value: unknown): boolean {
  if (Object.is(value, -0)) return true;
  if (Array.isArray(value)) return value.some(containsNegativeZero);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsNegativeZero);
  }
  return false;
}

describe("property-testing wiring", () => {
  it("runs a simple invariant property in the fast lane", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (xs) => {
        const reversedTwice = [...xs].reverse().reverse();
        expect(reversedTwice).toEqual(xs);
      }),
      propertyParameters(),
    );
  });

  it("holds a round-trip invariant (JSON encode/decode)", () => {
    fc.assert(
      fc.property(
        fc.jsonValue().filter((value) => !containsNegativeZero(value)),
        (value) => {
          expect(JSON.parse(JSON.stringify(value))).toEqual(value);
        },
      ),
      propertyParameters({ numRuns: 25 }),
    );
  });

  it("reproduces identical samples from a pinned seed (deterministic replay)", () => {
    const first = fc.sample(fc.tuple(fc.integer(), fc.string()), { seed: 4242, numRuns: 20 });
    const second = fc.sample(fc.tuple(fc.integer(), fc.string()), { seed: 4242, numRuns: 20 });
    expect(second).toEqual(first);
  });

  it("threads an explicit seed and shrink path into fc parameters", () => {
    const parameters = propertyParameters({ seed: 99, path: "3:2:1" });
    expect(parameters.seed).toBe(99);
    expect(parameters.path).toBe("3:2:1");
    expect(describeReproduction(parameters)).toContain("seed=99");
    expect(describeReproduction(parameters)).toContain("path=3:2:1");
  });

  it("reads the seed from SLOTNOVA_PROPERTY_SEED when no explicit seed is given", () => {
    const previous = process.env["SLOTNOVA_PROPERTY_SEED"];
    process.env["SLOTNOVA_PROPERTY_SEED"] = "1234";
    try {
      expect(propertyParameters().seed).toBe(1234);
    } finally {
      if (previous === undefined) delete process.env["SLOTNOVA_PROPERTY_SEED"];
      else process.env["SLOTNOVA_PROPERTY_SEED"] = previous;
    }
  });
});
