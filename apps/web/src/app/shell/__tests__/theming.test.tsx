// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "../../providers/ThemeProvider.js";
import { useTheme } from "../../providers/theme-context.js";

const here = dirname(fileURLToPath(import.meta.url));

function ThemeToggleProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

describe("Light/Dark theming is data-theme + token driven (T062.6)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
  });

  it("toggling the theme updates the document root's data-theme attribute", () => {
    render(
      <ThemeProvider>
        <ThemeToggleProbe />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("the generated Slotnova token CSS defines both a light and dark block keyed on data-theme", () => {
    const tokensCss = readFileSync(
      resolve(here, "../../../../../../packages/design-tokens/src/generated/tokens.css"),
      "utf8",
    );
    expect(tokensCss).toContain(':root[data-theme="light"]');
    expect(tokensCss).toContain(':root[data-theme="dark"]');
  });

  it("the Nova bridge maps --nova-* to --slotnova-* once, not a second theme system", () => {
    const bridgeCss = readFileSync(
      resolve(here, "../../../../../../packages/ui/src/theme/nova-bridge.css"),
      "utf8",
    );
    // The bridge applies to every data-theme value identically (a single
    // rule block covering :root, [data-theme="light"] and
    // [data-theme="dark"]) and only ever maps --nova-* to var(--slotnova-*)
    // — it never branches per theme or hard-codes a literal color/value
    // itself. Theming is entirely the token layer's responsibility
    // (asserted above); the bridge has exactly one rule block.
    const ruleBlocks = bridgeCss.match(/\{[^}]*\}/g) ?? [];
    expect(ruleBlocks).toHaveLength(1);
    expect(bridgeCss).toContain("var(--slotnova-");
  });
});

describe("Reduced motion (T062.7)", () => {
  it("the global reduced-motion stylesheet suppresses animation/transition without hard-coded raw values", () => {
    const reducedMotionCss = readFileSync(
      resolve(here, "../../../styles/reduced-motion.css"),
      "utf8",
    );
    expect(reducedMotionCss).toContain("prefers-reduced-motion: reduce");
    expect(reducedMotionCss).toMatch(/animation:\s*none\s*!important/);
    expect(reducedMotionCss).toMatch(/transition:\s*none\s*!important/);
  });
});
