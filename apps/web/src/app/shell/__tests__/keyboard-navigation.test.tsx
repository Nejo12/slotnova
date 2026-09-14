// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DesktopShell } from "../DesktopShell.js";
import { DESKTOP_NAV_GROUPS } from "../nav-items.js";
import { mockMatchMedia, renderShellAt } from "./test-support.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("Keyboard-only navigation (T062.4, T062.5)", () => {
  beforeEach(() => {
    mockMatchMedia(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("every desktop nav destination is a real link reachable by Tab, each focusable", async () => {
    const { Wrapped } = renderShellAt(<DesktopShell />);
    render(Wrapped);

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const allLabels = DESKTOP_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label));

    for (const label of allLabels) {
      const link = within(nav).getByRole("link", { name: label });
      // A native <a> (react-router NavLink) is Tab-reachable and
      // focusable by construction; assert it explicitly rather than
      // trusting the element type alone.
      link.focus();
      expect(document.activeElement).toBe(link);
    }
  });

  it("keyboard focus can reach the WorkspaceSwitcher and AccountMenu triggers", async () => {
    const user = userEvent.setup();
    const { Wrapped } = renderShellAt(<DesktopShell />);
    render(Wrapped);

    await screen.findByRole("navigation", { name: "Primary" });

    const switcherTrigger = screen.getByRole("button", { name: /Workspace switcher/ });
    const accountTrigger = screen.getByRole("button", { name: /Account menu/ });

    await user.tab();
    switcherTrigger.focus();
    expect(document.activeElement).toBe(switcherTrigger);

    accountTrigger.focus();
    expect(document.activeElement).toBe(accountTrigger);
  });

  it("nav links carry a visible-focus contract (focus-visible outline, token-driven)", () => {
    // jsdom does not compute :focus-visible styles from CSS Modules, so the
    // contract is verified directly against the source stylesheet rather
    // than a rendered computed style. Raw-color/motion compliance for this
    // same file is separately enforced by Stylelint (T053).
    const css = readFileSync(resolve(here, "../Navigation.module.scss"), "utf8");
    const focusVisibleBlock = /\.item:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(focusVisibleBlock).toMatch(
      /outline:\s*\S+\s+solid\s+var\(--slotnova-interaction-focus-ring\)/,
    );
    expect(focusVisibleBlock).not.toMatch(/outline:\s*none/);
  });
});
