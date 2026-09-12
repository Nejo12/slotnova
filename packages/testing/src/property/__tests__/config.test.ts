import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PROPERTY_RUNS,
  PROPERTY_RUNS_ENV,
  PROPERTY_SEED_ENV,
  defaultPropertyRuns,
  propertyParameters,
} from "../config.js";

/**
 * Unit coverage for env parsing in `config.ts` (fast-check seed/runs). A
 * fast-check seed is a signed 32-bit integer (fast-check can report and
 * replay negative seeds), which is a wider domain than `PROPERTY_RUNS_ENV`'s
 * strictly-positive example count — the two must not share one parser.
 */
describe("property config env parsing", () => {
  const previousSeed = process.env[PROPERTY_SEED_ENV];
  const previousRuns = process.env[PROPERTY_RUNS_ENV];

  afterEach(() => {
    if (previousSeed === undefined) delete process.env[PROPERTY_SEED_ENV];
    else process.env[PROPERTY_SEED_ENV] = previousSeed;

    if (previousRuns === undefined) delete process.env[PROPERTY_RUNS_ENV];
    else process.env[PROPERTY_RUNS_ENV] = previousRuns;
  });

  it("accepts a negative SLOTNOVA_PROPERTY_SEED exactly, for deterministic CI failure replay", () => {
    process.env[PROPERTY_SEED_ENV] = "-18472931";
    expect(propertyParameters().seed).toBe(-18472931);
  });

  it("still accepts a positive SLOTNOVA_PROPERTY_SEED", () => {
    process.env[PROPERTY_SEED_ENV] = "1234";
    expect(propertyParameters().seed).toBe(1234);
  });

  it("ignores a malformed SLOTNOVA_PROPERTY_SEED", () => {
    process.env[PROPERTY_SEED_ENV] = "not-a-seed";
    expect(propertyParameters().seed).toBeUndefined();
  });

  it("ignores a non-integer SLOTNOVA_PROPERTY_SEED", () => {
    process.env[PROPERTY_SEED_ENV] = "12.5";
    expect(propertyParameters().seed).toBeUndefined();
  });

  it("ignores an empty SLOTNOVA_PROPERTY_SEED", () => {
    process.env[PROPERTY_SEED_ENV] = "";
    expect(propertyParameters().seed).toBeUndefined();
  });

  it("accepts a zero SLOTNOVA_PROPERTY_SEED (a valid fast-check seed, not the 'unset' sentinel)", () => {
    process.env[PROPERTY_SEED_ENV] = "0";
    expect(propertyParameters().seed).toBe(0);
  });

  it("lets an explicit seed override SLOTNOVA_PROPERTY_SEED", () => {
    process.env[PROPERTY_SEED_ENV] = "-18472931";
    expect(propertyParameters({ seed: 7 }).seed).toBe(7);
  });

  it("still rejects a zero SLOTNOVA_PROPERTY_RUNS", () => {
    process.env[PROPERTY_RUNS_ENV] = "0";
    expect(defaultPropertyRuns()).toBe(DEFAULT_PROPERTY_RUNS);
  });

  it("still rejects a negative SLOTNOVA_PROPERTY_RUNS", () => {
    process.env[PROPERTY_RUNS_ENV] = "-5";
    expect(defaultPropertyRuns()).toBe(DEFAULT_PROPERTY_RUNS);
  });
});
