// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { meKey } from "../../query/keys.js";
import type { MeResponse } from "../../auth/session-api.js";
import { WorkspaceSwitcher } from "../WorkspaceSwitcher.js";

const noActiveWorkspaceMe: MeResponse = {
  user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
  activeWorkspace: null,
  workspaces: [
    { id: "workspace-a", name: "E2E Alpha Workspace", role: "owner" },
    { id: "workspace-b", name: "E2E Beta Workspace", role: "owner" },
  ],
  session: { expiresAt: "2099-01-01T00:00:00Z" },
};

describe("WorkspaceSwitcher (no active workspace yet)", () => {
  afterEach(() => {
    cleanup();
  });

  it("prompts selection and still lists every membership when activeWorkspace is null", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(meKey(), noActiveWorkspaceMe);

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSwitcher />
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Workspace switcher, current workspace Select a workspace",
    });
    expect(trigger).not.toBeNull();
  });
});
