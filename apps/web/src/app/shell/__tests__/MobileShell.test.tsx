// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MobileShell } from "../MobileShell.js";
import { mockMatchMedia, renderShellAt } from "./test-support.js";

describe("MobileShell", () => {
  beforeEach(() => {
    mockMatchMedia(() => true);
  });

  afterEach(() => {
    cleanup();
  });

  it("is axe-clean", async () => {
    const { Wrapped } = renderShellAt(<MobileShell />);
    const { container } = render(Wrapped);

    await waitFor(() => expect(screen.getByRole("navigation")).not.toBeNull());

    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("primary navigation is exactly Home, Calendar, Clients, Recovery, More (hard product invariant)", async () => {
    const { Wrapped } = renderShellAt(<MobileShell />);
    render(Wrapped);

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    const button = within(nav).getByRole("button", { name: "More destinations" });

    expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "Calendar",
      "Clients",
      "Recovery",
    ]);
    expect(button).not.toBeNull();
  });

  it("does not render the desktop sidebar navigation groups (deliberate substitution, not compression)", async () => {
    const { Wrapped } = renderShellAt(<MobileShell />);
    render(Wrapped);

    await screen.findByRole("navigation", { name: "Primary" });
    expect(screen.queryByText("Today & customers")).toBeNull();
    expect(screen.queryByText("Commerce")).toBeNull();
  });
});
