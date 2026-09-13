import { describe, expect, it } from "vitest";

import { InvalidTimeZoneError, assertValidIanaTimeZone, isValidIanaTimeZone } from "../timezone.js";

describe("isValidIanaTimeZone (ADR-010)", () => {
  it("accepts a real IANA zone id", () => {
    expect(isValidIanaTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
  });

  it("rejects a non-IANA string", () => {
    expect(isValidIanaTimeZone("Not/AZone")).toBe(false);
    expect(isValidIanaTimeZone("EST")).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone("Europe/berlin")).toBe(false);
  });
});

describe("assertValidIanaTimeZone", () => {
  it("does not throw for a valid zone", () => {
    expect(() => assertValidIanaTimeZone("Asia/Tokyo")).not.toThrow();
  });

  it("throws InvalidTimeZoneError for an invalid zone", () => {
    expect(() => assertValidIanaTimeZone("Nowhere/Special")).toThrow(InvalidTimeZoneError);
  });
});
