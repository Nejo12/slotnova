// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { meKey, wsKey } from "../../query/keys.js";
import type { MeResponse } from "../session-api.js";
import { useWorkspaceSwitch } from "../use-workspace-switch.js";

vi.mock("../session-api.js", async () => {
  const actual = await vi.importActual<typeof import("../session-api.js")>("../session-api.js");
  return { ...actual, switchWorkspace: vi.fn() };
});

import { switchWorkspace } from "../session-api.js";

const mockedSwitchWorkspace = vi.mocked(switchWorkspace);

const workspaceBMe: MeResponse = {
  user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
  activeWorkspace: {
    id: "workspace-b",
    name: "E2E Beta Workspace",
    role: "owner",
    permissions: [],
  },
  workspaces: [
    { id: "workspace-a", name: "E2E Alpha Workspace", role: "owner" },
    { id: "workspace-b", name: "E2E Beta Workspace", role: "owner" },
  ],
  session: { expiresAt: "2099-01-01T00:00:00Z" },
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useWorkspaceSwitch (cache-clear-before-refetch ordering)", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("clears every cached workspace-A query before the new /me data is visible", async () => {
    mockedSwitchWorkspace.mockResolvedValue(workspaceBMe);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Seed stale workspace-A data exactly as a real feature query would.
    queryClient.setQueryData(wsKey("workspace-a", "clients"), ["stale-client-1"]);
    queryClient.setQueryData(meKey(), { activeWorkspace: { id: "workspace-a" } });

    const { result } = renderHook(() => useWorkspaceSwitch(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync("workspace-b");
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(wsKey("workspace-a", "clients"))).toBeUndefined();
    });
  });

  it("re-seeds /me with the new active workspace after clearing", async () => {
    mockedSwitchWorkspace.mockResolvedValue(workspaceBMe);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(meKey(), { activeWorkspace: { id: "workspace-a" } });

    const { result } = renderHook(() => useWorkspaceSwitch(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync("workspace-b");
    });

    const me = queryClient.getQueryData<MeResponse>(meKey());
    expect(me?.activeWorkspace?.id).toBe("workspace-b");
  });

  it("never leaves a stale workspace-A query cached alongside the new /me data", async () => {
    mockedSwitchWorkspace.mockResolvedValue(workspaceBMe);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(wsKey("workspace-a", "clients"), ["stale-client-1"]);

    const { result } = renderHook(() => useWorkspaceSwitch(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync("workspace-b");
    });

    // The defining assertion: at no point after settling does workspace-A
    // data coexist with the new workspace-B session.
    const me = queryClient.getQueryData<MeResponse>(meKey());
    const staleA = queryClient.getQueryData(wsKey("workspace-a", "clients"));
    expect(me?.activeWorkspace?.id).toBe("workspace-b");
    expect(staleA).toBeUndefined();
  });
});
