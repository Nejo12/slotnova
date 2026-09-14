// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { meKey, wsKey } from "../../query/keys.js";
import { useLogout } from "../use-logout.js";

vi.mock("../session-api.js", async () => {
  const actual = await vi.importActual<typeof import("../session-api.js")>("../session-api.js");
  return { ...actual, signOut: vi.fn() };
});

import { signOut } from "../session-api.js";

const mockedSignOut = vi.mocked(signOut);

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useLogout", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("calls the sign-out endpoint (revokes the session server-side)", async () => {
    mockedSignOut.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedSignOut).toHaveBeenCalledOnce();
  });

  it("clears the entire TanStack Query cache on success, including workspace and session data", async () => {
    mockedSignOut.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(meKey(), { activeWorkspace: { id: "workspace-a" } });
    queryClient.setQueryData(wsKey("workspace-a", "clients"), ["client-1"]);

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryData(meKey())).toBeUndefined();
    expect(queryClient.getQueryData(wsKey("workspace-a", "clients"))).toBeUndefined();
  });

  it("does not clear the cache if the sign-out request fails (no fake client-only logout)", async () => {
    mockedSignOut.mockRejectedValue(new Error("network error"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(meKey(), { activeWorkspace: { id: "workspace-a" } });

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });

    expect(queryClient.getQueryData(meKey())).toBeDefined();
  });
});
