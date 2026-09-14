import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "__fixtures__");
// The rule config itself (no `ignoreFiles`) — the root `stylelint.config.cjs`
// deliberately excludes these fixtures from the whole-workspace `lint:styles`
// run, which would make them silently pass here too if reused.
const configFile = join(here, "..", "index.cjs");

async function lintFixture(fixture: string): Promise<{ errored: boolean; ruleNames: string[] }> {
  const result = await stylelint.lint({
    files: join(fixturesRoot, fixture, "**", "*.scss"),
    configFile,
  });
  const ruleNames = result.results.flatMap((fileResult) =>
    fileResult.warnings.map((warning) => warning.rule),
  );
  return { errored: result.errored, ruleNames };
}

describe("Stylelint token/theme-layer enforcement (T053)", () => {
  it("raw hex color in a component SCSS module fails lint", async () => {
    const { errored, ruleNames } = await lintFixture("raw-hex-fails");
    expect(errored).toBe(true);
    expect(ruleNames).toContain("scale-unlimited/declaration-strict-value");
  });

  it("token-based color (var(--...)) passes lint", async () => {
    const { errored, ruleNames } = await lintFixture("token-color-passes");
    expect(ruleNames).not.toContain("scale-unlimited/declaration-strict-value");
    expect(errored).toBe(false);
  });

  it("raw motion duration/easing in a component SCSS module fails lint", async () => {
    const { errored, ruleNames } = await lintFixture("raw-motion-fails");
    expect(errored).toBe(true);
    expect(ruleNames).toContain("scale-unlimited/declaration-strict-value");
  });

  it("token-based motion (var(--...)) passes lint", async () => {
    const { errored, ruleNames } = await lintFixture("token-motion-passes");
    expect(ruleNames).not.toContain("scale-unlimited/declaration-strict-value");
    expect(errored).toBe(false);
  });

  it("the generated design-tokens CSS layer is exempt from the raw-value ban", async () => {
    const result = await stylelint.lint({
      files: join(here, "..", "..", "..", "packages/design-tokens/src/generated/tokens.css"),
      configFile,
    });
    const ruleNames = result.results.flatMap((fileResult) =>
      fileResult.warnings.map((warning) => warning.rule),
    );
    expect(ruleNames).not.toContain("scale-unlimited/declaration-strict-value");
    expect(result.errored).toBe(false);
  });
});
