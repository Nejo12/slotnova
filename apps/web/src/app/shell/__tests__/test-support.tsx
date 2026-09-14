import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import { meKey } from "../../query/keys.js";
import { ThemeProvider } from "../../providers/ThemeProvider.js";
import type { MeResponse } from "../../auth/session-api.js";

export const alphaWorkspaceMe: MeResponse = {
  user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
  activeWorkspace: {
    id: "workspace-a",
    name: "E2E Alpha Workspace",
    role: "owner",
    permissions: ["members:invite"],
  },
  workspaces: [
    { id: "workspace-a", name: "E2E Alpha Workspace", role: "owner" },
    { id: "workspace-b", name: "E2E Beta Workspace", role: "owner" },
  ],
  session: { expiresAt: "2099-01-01T00:00:00Z" },
};

/** Renders `element` at `path` with a pre-seeded signed-in session, real router context and ThemeProvider. */
export function renderShellAt(
  element: ReactElement,
  path = "/",
): { queryClient: QueryClient; Wrapped: ReactElement } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(meKey(), alphaWorkspaceMe);

  const router = createMemoryRouter([{ path: "*", element }], { initialEntries: [path] });

  return {
    queryClient,
    Wrapped: (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    ),
  };
}

/** Minimal matchMedia mock so components using useMediaQuery don't throw in jsdom. */
export function mockMatchMedia(matchesQuery: (query: string) => boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: matchesQuery(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
