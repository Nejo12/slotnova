// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";

describe("App (T058: shell root)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not render the authenticated shell without a valid session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }) as Response,
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText(/signed out/i)).toBeDefined());
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders the authenticated shell once GET /v1/me resolves with a session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
          activeWorkspace: {
            id: "workspace-1",
            name: "E2E Alpha Workspace",
            role: "owner",
            permissions: [],
          },
          workspaces: [{ id: "workspace-1", name: "E2E Alpha Workspace", role: "owner" }],
          session: { expiresAt: "2099-01-01T00:00:00Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ) as Response,
    );

    render(<App />);

    await waitFor(() => expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0));
  });
});
