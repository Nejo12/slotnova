// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DesktopShell } from "../DesktopShell.js";
import { alphaWorkspaceMe, mockMatchMedia, renderShellAt } from "./test-support.js";

describe("DesktopShell", () => {
  beforeEach(() => {
    mockMatchMedia(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("is axe-clean (T062.1)", async () => {
    const { Wrapped } = renderShellAt(<DesktopShell />);
    const { container } = render(Wrapped);

    await waitFor(() => expect(screen.getByRole("navigation")).not.toBeNull());

    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("exposes the primary navigation landmark with every configured destination", async () => {
    const { Wrapped } = renderShellAt(<DesktopShell />);
    render(Wrapped);

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(nav.textContent).toContain("Home");
    expect(nav.textContent).toContain("Calendar");
    expect(nav.textContent).toContain("Clients");
    expect(nav.textContent).toContain("Recovery");
    expect(nav.textContent).toContain("Settings");
  });

  it("exposes an accessible WorkspaceSwitcher naming the active workspace (T062.2)", async () => {
    const { Wrapped } = renderShellAt(<DesktopShell />);
    render(Wrapped);

    const switcher = await screen.findByRole("button", {
      name: `Workspace switcher, current workspace ${alphaWorkspaceMe.activeWorkspace?.name}`,
    });
    expect(switcher).not.toBeNull();
  });

  it("exposes an accessible AccountMenu naming the signed-in user (T062.3)", async () => {
    const { Wrapped } = renderShellAt(<DesktopShell />);
    render(Wrapped);

    const accountMenu = await screen.findByRole("button", {
      name: `Account menu for ${alphaWorkspaceMe.user.displayName}`,
    });
    expect(accountMenu).not.toBeNull();
  });
});
