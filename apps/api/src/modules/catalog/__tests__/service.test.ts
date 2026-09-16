import { describe, expect, it } from "vitest";

import {
  InvalidServiceBufferError,
  InvalidServiceDurationError,
  InvalidServiceNameError,
  assertValidServiceCreateInput,
  assertValidServiceUpdateInput,
} from "../domain/service.js";
import { InvalidCurrencyError, InvalidMoneyAmountError } from "../domain/money.js";

const VALID_INPUT = {
  name: "Deep tissue massage",
  durationMinutes: 60,
  price: { amountMinor: 8000, currency: "USD" },
};

describe("Service creation invariants (FR-001)", () => {
  it("accepts a fully valid create input", () => {
    expect(() => assertValidServiceCreateInput(VALID_INPUT)).not.toThrow();
  });

  it("accepts optional buffers/category omitted (defaults apply downstream)", () => {
    const { name, durationMinutes, price } = VALID_INPUT;
    expect(() => assertValidServiceCreateInput({ name, durationMinutes, price })).not.toThrow();
  });

  it("rejects a blank name", () => {
    expect(() => assertValidServiceCreateInput({ ...VALID_INPUT, name: "  " })).toThrow(
      InvalidServiceNameError,
    );
  });

  it("rejects duration_minutes = 0", () => {
    expect(() => assertValidServiceCreateInput({ ...VALID_INPUT, durationMinutes: 0 })).toThrow(
      InvalidServiceDurationError,
    );
  });

  it("rejects a negative duration", () => {
    expect(() => assertValidServiceCreateInput({ ...VALID_INPUT, durationMinutes: -30 })).toThrow(
      InvalidServiceDurationError,
    );
  });

  it("rejects a non-integer duration", () => {
    expect(() => assertValidServiceCreateInput({ ...VALID_INPUT, durationMinutes: 45.5 })).toThrow(
      InvalidServiceDurationError,
    );
  });

  it("rejects a negative pre-buffer", () => {
    expect(() => assertValidServiceCreateInput({ ...VALID_INPUT, preBufferMinutes: -5 })).toThrow(
      InvalidServiceBufferError,
    );
  });

  it("rejects a negative post-buffer", () => {
    expect(() => assertValidServiceCreateInput({ ...VALID_INPUT, postBufferMinutes: -1 })).toThrow(
      InvalidServiceBufferError,
    );
  });

  it("accepts a zero buffer", () => {
    expect(() =>
      assertValidServiceCreateInput({ ...VALID_INPUT, preBufferMinutes: 0, postBufferMinutes: 0 }),
    ).not.toThrow();
  });

  it("rejects a negative price amount", () => {
    expect(() =>
      assertValidServiceCreateInput({
        ...VALID_INPUT,
        price: { amountMinor: -100, currency: "USD" },
      }),
    ).toThrow(InvalidMoneyAmountError);
  });

  it("rejects an invalid currency using the accepted currency semantics", () => {
    expect(() =>
      assertValidServiceCreateInput({
        ...VALID_INPUT,
        price: { amountMinor: 100, currency: "ZZZ" },
      }),
    ).toThrow(InvalidCurrencyError);
  });
});

describe("Service update invariants preserve create invariants", () => {
  it("accepts an empty update (no fields changed)", () => {
    expect(() => assertValidServiceUpdateInput({})).not.toThrow();
  });

  it("accepts updating only active state", () => {
    expect(() => assertValidServiceUpdateInput({ active: false })).not.toThrow();
    expect(() => assertValidServiceUpdateInput({ active: true })).not.toThrow();
  });

  it("validates a supplied name", () => {
    expect(() => assertValidServiceUpdateInput({ name: "" })).toThrow(InvalidServiceNameError);
  });

  it("validates a supplied duration", () => {
    expect(() => assertValidServiceUpdateInput({ durationMinutes: 0 })).toThrow(
      InvalidServiceDurationError,
    );
  });

  it("validates a supplied buffer", () => {
    expect(() => assertValidServiceUpdateInput({ preBufferMinutes: -1 })).toThrow(
      InvalidServiceBufferError,
    );
  });

  it("validates a supplied price", () => {
    expect(() =>
      assertValidServiceUpdateInput({ price: { amountMinor: 100, currency: "ZZZ" } }),
    ).toThrow(InvalidCurrencyError);
  });

  it("does not require duration to be present on an update", () => {
    expect(() => assertValidServiceUpdateInput({ name: "New name" })).not.toThrow();
  });
});
