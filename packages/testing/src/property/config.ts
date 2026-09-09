/**
 * Shared fast-check configuration for the Slotnova fast lane (task T015).
 *
 * Goals:
 * - property tests run inside the ordinary `pnpm test` fast lane
 * - a failing run always reports a seed (and shrink path) that reproduces it
 * - example counts stay small enough that the fast lane target holds
 * - no arbitrary sleeps and no wall-clock dependence
 */

import fc from "fast-check";

/** Pin every property run in a process to one seed: `SLOTNOVA_PROPERTY_SEED=42 pnpm test`. */
export const PROPERTY_SEED_ENV = "SLOTNOVA_PROPERTY_SEED";

/** Raise the example count for a deeper local/nightly sweep: `SLOTNOVA_PROPERTY_RUNS=1000 pnpm test`. */
export const PROPERTY_RUNS_ENV = "SLOTNOVA_PROPERTY_RUNS";

/**
 * Default example count. Deliberately modest so a property file stays cheap in
 * the < 3-minute fast lane; widen per-property with `{ numRuns }` or globally
 * with `SLOTNOVA_PROPERTY_RUNS` for a nightly sweep.
 */
export const DEFAULT_PROPERTY_RUNS = 50;

function readPositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Example count in effect once env overrides are applied. */
export function defaultPropertyRuns(): number {
  return readPositiveIntEnv(PROPERTY_RUNS_ENV) ?? DEFAULT_PROPERTY_RUNS;
}

export interface PropertyParametersInput {
  /** Override the example count for one property. */
  readonly numRuns?: number;
  /** Pin the seed for one property (takes precedence over `SLOTNOVA_PROPERTY_SEED`). */
  readonly seed?: number;
  /**
   * Replay one shrink path reported by an earlier failure. Copy it verbatim
   * from the failure output alongside the seed.
   */
  readonly path?: string;
  /**
   * Per-predicate wall-clock budget in ms. This is a hang guard, never a sleep:
   * a property that exceeds it fails fast instead of stalling the lane.
   */
  readonly timeoutMs?: number;
}

/**
 * Build the `fc.assert` parameters for a Slotnova property test. Use as:
 *
 * ```ts
 * fc.assert(
 *   fc.property(fc.array(fc.integer()), (xs) => xs.length >= 0),
 *   propertyParameters(),
 * );
 * ```
 *
 * `endOnFailure` is left off so fast-check keeps shrinking to a minimal
 * counterexample; the seed and shrink path it prints reproduce the failure
 * exactly.
 */
export function propertyParameters(input: PropertyParametersInput = {}): fc.Parameters<unknown> {
  const seed = input.seed ?? readPositiveIntEnv(PROPERTY_SEED_ENV);

  return {
    numRuns: input.numRuns ?? defaultPropertyRuns(),
    includeErrorInReport: true,
    ...(seed !== undefined ? { seed } : {}),
    ...(input.path !== undefined ? { path: input.path } : {}),
    ...(input.timeoutMs !== undefined ? { timeout: input.timeoutMs } : {}),
  };
}

/**
 * One-line reproduction hint for logs/CI annotations. fast-check already prints
 * the seed and path on failure; this is for code that wants to surface it
 * itself (for example a custom reporter).
 */
export function describeReproduction(parameters: fc.Parameters<unknown>): string {
  const seed = parameters.seed ?? "<random – see failure output>";
  const path = parameters.path ?? "<none>";
  return `re-run with seed=${seed} path=${path} (or set ${PROPERTY_SEED_ENV})`;
}
