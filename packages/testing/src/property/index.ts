/**
 * `@slotnova/testing/property` — fast-check wiring and conventions (task T015).
 *
 * This entry point re-exports fast-check plus the shared fast-lane
 * configuration. It intentionally ships **no** Slotnova-specific arbitraries
 * yet — those arrive with the product phases they belong to (scheduling/DST,
 * interval algebra, money allocation, Recovery state machines) and are added
 * here as additional named exports, which is a non-breaking change.
 *
 * See `docs/testing/property-testing-conventions.md`.
 */

export { default as fc } from "fast-check";
export type { Arbitrary } from "fast-check";

export {
  DEFAULT_PROPERTY_RUNS,
  PROPERTY_RUNS_ENV,
  PROPERTY_SEED_ENV,
  defaultPropertyRuns,
  describeReproduction,
  propertyParameters,
} from "./config.js";
export type { PropertyParametersInput } from "./config.js";
