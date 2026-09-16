import { describe, expect, it } from "vitest";

import {
  InvalidCurrencyError,
  InvalidMoneyAmountError,
  assertValidMoney,
  isValidCurrencyCode,
  minorUnitExponent,
} from "../domain/money.js";

describe("money (catalog domain)", () => {
  it("accepts a recognised currency with a non-negative integer amount", () => {
    expect(() => assertValidMoney({ amountMinor: 1500, currency: "USD" })).not.toThrow();
  });

  it("accepts a zero amount", () => {
    expect(() => assertValidMoney({ amountMinor: 0, currency: "GBP" })).not.toThrow();
  });

  it("rejects a negative amount", () => {
    expect(() => assertValidMoney({ amountMinor: -1, currency: "USD" })).toThrow(
      InvalidMoneyAmountError,
    );
  });

  it("rejects a non-integer amount", () => {
    expect(() => assertValidMoney({ amountMinor: 10.5, currency: "USD" })).toThrow(
      InvalidMoneyAmountError,
    );
  });

  it("rejects an unrecognised currency code", () => {
    expect(() => assertValidMoney({ amountMinor: 100, currency: "ZZZ" })).toThrow(
      InvalidCurrencyError,
    );
  });

  it("isValidCurrencyCode reports known vs unknown codes", () => {
    expect(isValidCurrencyCode("USD")).toBe(true);
    expect(isValidCurrencyCode("JPY")).toBe(true);
    expect(isValidCurrencyCode("ZZZ")).toBe(false);
  });

  it("minorUnitExponent returns the correct exponent per currency", () => {
    expect(minorUnitExponent("USD")).toBe(2);
    expect(minorUnitExponent("JPY")).toBe(0);
    expect(minorUnitExponent("BHD")).toBe(3);
  });

  it("minorUnitExponent throws for an unrecognised currency", () => {
    expect(() => minorUnitExponent("ZZZ")).toThrow(InvalidCurrencyError);
  });
});
