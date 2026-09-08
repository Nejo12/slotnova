import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cruise,
  type IConfiguration,
  type ICruiseOptions,
  type ICruiseResult,
} from "dependency-cruiser";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const dc = require("../.dependency-cruiser.cjs") as IConfiguration;

const forbidden = dc.forbidden ?? [];
const ruleNames = (): string[] => forbidden.map((rule) => rule.name ?? "<unnamed>");

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "__fixtures__");

/** Cruise one fixture tree with its own baseDir; return the forbidden-rule names that fired. */
async function violatedRules(fixture: string): Promise<string[]> {
  const options: ICruiseOptions = {
    baseDir: join(fixturesRoot, fixture),
    validate: true,
    ruleSet: { forbidden },
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  };
  const enhanced = dc.options?.enhancedResolveOptions;
  if (enhanced) options.enhancedResolveOptions = enhanced;

  const { output } = await cruise(["."], options);
  const result: ICruiseResult =
    typeof output === "string" ? (JSON.parse(output) as ICruiseResult) : output;
  return (result.summary.violations ?? []).map((violation) => violation.rule.name);
}

/** Cruise a fixture tree and return `{ rule, from }` for every violation. */
async function violations(fixture: string): Promise<Array<{ rule: string; from: string }>> {
  const options: ICruiseOptions = {
    baseDir: join(fixturesRoot, fixture),
    validate: true,
    ruleSet: { forbidden },
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  };
  const enhanced = dc.options?.enhancedResolveOptions;
  if (enhanced) options.enhancedResolveOptions = enhanced;

  const { output } = await cruise(["."], options);
  const result: ICruiseResult =
    typeof output === "string" ? (JSON.parse(output) as ICruiseResult) : output;
  return (result.summary.violations ?? []).map((violation) => ({
    rule: violation.rule.name,
    from: violation.from,
  }));
}

/** Each entry: a fixture directory and the single rule it must trigger. */
const VIOLATION_CASES: ReadonlyArray<readonly [fixture: string, rule: string]> = [
  ["no-circular", "no-circular"],
  ["ui-not-to-infra", "ui-not-to-infra"],
  ["domain-not-to-provider-sdk", "domain-not-to-provider-sdk"],
  ["no-cross-module-internals", "no-cross-module-internals"],
  ["no-observability-server-in-browser", "no-observability-server-in-browser"],
  ["no-deep-import-across-packages", "no-deep-import-across-packages"],
];

/** Forbidden rules that are structural guardrails, not tied to one dedicated fixture. */
const UNFIXTURED_RULES = new Set(["not-to-unresolvable"]);

describe("dependency-cruiser core boundary ruleset", () => {
  it.each(VIOLATION_CASES)("fixture '%s' trips rule '%s'", async (fixture, rule) => {
    expect(await violatedRules(fixture)).toContain(rule);
  });

  it("blocks packages/observability-browser from importing observability-server", async () => {
    const fired = await violations("no-observability-server-in-browser");
    expect(fired).toContainEqual({
      rule: "no-observability-server-in-browser",
      from: "packages/observability-browser/src/bad.ts",
    });
  });

  it("the compliant fixture trips no rule", async () => {
    expect(await violatedRules("compliant")).toEqual([]);
  });

  it("every core forbidden rule is covered by a fixture", () => {
    const uncovered = new Set(ruleNames());
    for (const [, rule] of VIOLATION_CASES) uncovered.delete(rule);
    for (const rule of UNFIXTURED_RULES) uncovered.delete(rule);
    expect([...uncovered]).toEqual([]);
  });
});
