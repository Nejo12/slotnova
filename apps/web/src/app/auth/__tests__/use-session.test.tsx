// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionInvalidError, type MeResponse } from "../session-api.js";
import { useSession } from "../use-session.js";

vi.mock("../session-api.js", async () => {
  const actual = await vi.importActual<typeof import("../session-api.js")>("../session-api.js");
  return { ...actual, fetchMe: vi.fn() };
});

import { fetchMe } from "../session-api.js";

const mockedFetchMe = vi.mocked(fetchMe);

const activeWorkspaceMe: MeResponse = {
  user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
  activeWorkspace: {
    id: "workspace-1",
    name: "E2E Alpha Workspace",
    role: "owner",
    permissions: ["members:invite"],
  },
  workspaces: [{ id: "workspace-1", name: "E2E Alpha Workspace", role: "owner" }],
  session: { expiresAt: "2099-01-01T00:00:00Z" },
};

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useSession", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("reports status 'loading' while the /me request is in flight", () => {
    mockedFetchMe.mockReturnValue(new Promise(() => {}));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSession(), { wrapper: wrapper(queryClient) });

    expect(result.current.status).toBe("loading");
  });

  it("reports status 'signed-in' with the active workspace once /me resolves", async () => {
    mockedFetchMe.mockResolvedValue(activeWorkspaceMe);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSession(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    expect(result.current.activeWorkspace?.id).toBe("workspace-1");
  });

  it("reports status 'signed-out' when /me returns a session-invalid error", async () => {
    mockedFetchMe.mockRejectedValue(new SessionInvalidError());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSession(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
  });

  it("never retries a failed /me request (fails closed, no retry storms on an invalid session)", async () => {
    mockedFetchMe.mockRejectedValue(new SessionInvalidError());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSession(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    expect(mockedFetchMe).toHaveBeenCalledOnce();
  });
});
