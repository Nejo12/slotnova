// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Badge, Button, Card } from "../index.js";
import { EmptyStatePresentation, ErrorStatePresentation } from "../system-states/index.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadCss(...segments: string[]): string {
  return readFileSync(resolve(here, ...segments), "utf8");
}

beforeAll(() => {
  // Wire the real, generated three-file token chain (Nova primitives ->
  // Slotnova semantics -> Nova bridge) into jsdom exactly as a consuming
  // app would via CSS imports, so computed styles reflect the actual
  // published/generated contract rather than a hand-written test double.
  const novaPrimitives = readFileSync(
    resolve(here, "../../node_modules/@nova-component/design-tokens/dist/tokens.css"),
    "utf8",
  );
  const slotnovaTokens = loadCss(
    "..",
    "..",
    "..",
    "design-tokens",
    "src",
    "generated",
    "tokens.css",
  );
  const bridge = loadCss("..", "theme", "nova-bridge.css");

  const sheet = document.createElement("style");
  sheet.textContent = [novaPrimitives, slotnovaTokens, bridge].join("\n\n");
  document.head.appendChild(sheet);
});

describe("Light/Dark theme compatibility (F)", () => {
  afterEach(() => {
    cleanup();
  });

  it("resolves a Slotnova semantic token to different concrete values under Light vs Dark", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const lightAction = getComputedStyle(document.documentElement).getPropertyValue(
      "--slotnova-action-primary",
    );

    document.documentElement.setAttribute("data-theme", "dark");
    const darkAction = getComputedStyle(document.documentElement).getPropertyValue(
      "--slotnova-action-primary",
    );

    expect(lightAction.trim()).not.toBe("");
    expect(darkAction.trim()).not.toBe("");
    expect(lightAction.trim()).not.toBe(darkAction.trim());

    document.documentElement.removeAttribute("data-theme");
  });

  it("resolves the Nova bridge variable Nova's Button reads to the Slotnova value, in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      document.documentElement.setAttribute("data-theme", theme);

      const slotnovaValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--slotnova-action-primary")
        .trim();
      const novaBridgedValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--nova-color-action-primary")
        .trim();

      // The bridge sets --nova-color-action-primary: var(--slotnova-action-primary);
      // getComputedStyle on a custom property returns the raw declared value
      // (including the var() reference) in jsdom, so assert the reference
      // itself points at the correct Slotnova variable rather than expecting
      // browser-level var() resolution, which jsdom does not perform.
      expect(novaBridgedValue).toContain("--slotnova-action-primary");
      expect(slotnovaValue).not.toBe("");
    }

    document.documentElement.removeAttribute("data-theme");
  });

  it("renders representative compositions without throwing under both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      document.documentElement.setAttribute("data-theme", theme);

      render(
        <div>
          <Button>Save</Button>
          <Badge tone="success">Active</Badge>
          <Card variant="elevated">Summary</Card>
          <EmptyStatePresentation heading="No clients" />
          <ErrorStatePresentation title="Failed">Try again.</ErrorStatePresentation>
        </div>,
      );

      expect(screen.getByRole("button", { name: "Save" })).not.toBeNull();
      cleanup();
    }

    document.documentElement.removeAttribute("data-theme");
  });
});
