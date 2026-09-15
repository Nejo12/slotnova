// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionApi from "../../auth/session-api.js";
import type { MeResponse } from "../../auth/session-api.js";
import { DesktopShell } from "../DesktopShell.js";
import { alphaWorkspaceMe, mockMatchMedia, renderShellAt } from "./test-support.js";

vi.mock("../../auth/session-api.js", async () => {
  const actual = await vi.importActual<typeof SessionApi>("../../auth/session-api.js");
  return { ...actual, switchWorkspace: vi.fn() };
});

import { switchWorkspace } from "../../auth/session-api.js";

const betaWorkspaceMe: MeResponse = {
  ...alphaWorkspaceMe,
  activeWorkspace: {
    id: "workspace-b",
    name: "E2E Beta Workspace",
    role: "owner",
    permissions: [],
  },
};

describe("Shell shows zero stale prior-workspace data after switch (T062.11)", () => {
  beforeEach(() => {
    mockMatchMedia(() => false);
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("replaces the active-workspace name in the switcher with no trace of the prior workspace", async () => {
    vi.mocked(switchWorkspace).mockResolvedValue(betaWorkspaceMe);
    const user = userEvent.setup();
    const { Wrapped } = renderShellAt(<DesktopShell />);
    render(Wrapped);

    const switcherBefore = await screen.findByRole("button", {
      name: /Workspace switcher, current workspace E2E Alpha Workspace/,
    });
    expect(screen.queryByText("E2E Beta Workspace")).toBeNull();

    await user.click(switcherBefore);
    const betaOption = await screen.findByRole("menuitem", { name: "E2E Beta Workspace" });
    await user.click(betaOption);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /Workspace switcher, current workspace E2E Beta Workspace/,
        }),
      ).not.toBeNull(),
    );

    // The defining assertion: workspace-A's name is gone entirely, not
    // merely relabeled in one spot while lingering elsewhere in the shell.
    expect(screen.queryByText("E2E Alpha Workspace")).toBeNull();
  });
});
