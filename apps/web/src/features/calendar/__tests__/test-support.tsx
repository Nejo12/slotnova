import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import type { MeResponse } from "../../../app/auth/session-api.js";
import { ThemeProvider } from "../../../app/providers/ThemeProvider.js";
import { meKey } from "../../../app/query/keys.js";
import { CreateBookingRoute } from "../../booking/create/CreateBookingRoute.js";
import { CalendarRoute } from "../CalendarRoute.js";
import type { CalendarView, ProblemDetails } from "../api/types.js";

/**
 * The origin the Calendar API client talks to under test. It matches
 * `calendar-api.ts`'s default (`VITE_API_URL` is not defined in a unit run)
 * and is a local host, so the global network denylist
 * (`@slotnova/testing/msw/deny-network`) permits MSW to answer it.
 */
export const API_ORIGIN = "http://localhost:3001";

export const WORKSPACE_ID = "workspace-a";
export const OTHER_WORKSPACE_ID = "workspace-b";

/** Both capabilities `GET /v1/calendar` requires, plus the create affordance. */
export const CALENDAR_CAPABILITIES = ["booking:read", "scheduling:read", "booking:create"];
/** Enough to read, not enough to enter the create flow. */
export const READ_ONLY_CAPABILITIES = ["booking:read", "scheduling:read"];

export const BOOKING_ID = "99999999-9999-4999-8999-999999999999";
export const SERVICE_ID = "11111111-1111-4111-8111-111111111111";

export function meFixture(
  permissions: readonly string[],
  workspaceId: string = WORKSPACE_ID,
): MeResponse {
  return {
    user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
    activeWorkspace: {
      id: workspaceId,
      name: "Alpha Workspace",
      role: "owner",
      permissions: [...permissions],
    },
    workspaces: [{ id: workspaceId, name: "Alpha Workspace", role: "owner" }],
    session: { expiresAt: "2099-01-01T00:00:00Z" },
  };
}

/** A day with one open period and one confirmed booking inside it. */
export function mixedView(): CalendarView {
  return {
    range: { start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z" },
    open: [{ start: "2026-10-01T08:00:00Z", end: "2026-10-01T16:00:00Z" }],
    occupied: [
      {
        bookingId: BOOKING_ID,
        serviceId: SERVICE_ID,
        startsAt: "2026-10-01T10:00:00Z",
        occupied: { start: "2026-10-01T09:55:00Z", end: "2026-10-01T10:55:00Z" },
        status: "confirmed",
      },
    ],
  };
}

export function openOnlyView(): CalendarView {
  return { ...mixedView(), occupied: [] };
}

export function occupiedOnlyView(): CalendarView {
  return { ...mixedView(), open: [] };
}

export function emptyView(): CalendarView {
  return { range: mixedView().range, open: [], occupied: [] };
}

/** RFC 9457 body with the stable `type` slug the UI branches on. */
export function problemBody(slug: string, status: number): ProblemDetails {
  return {
    type: `https://slotnova.app/problems/${slug}`,
    title: "Problem",
    status,
    instance: "https://slotnova.app/requests/test",
  };
}

export interface RenderCalendarOptions {
  path?: string;
  permissions?: readonly string[];
  workspaceId?: string;
  queryClient?: QueryClient;
}

export interface RenderedCalendar extends RenderResult {
  queryClient: QueryClient;
  user: UserEvent;
  /** The current location, so a navigation assertion reads the real router. */
  currentPath: () => string;
}

/**
 * Renders the real Calendar route behind a real data router and a pre-seeded
 * signed-in session, exactly as the shell would. The Booking routes it
 * navigates INTO are registered as minimal stand-ins (plus the real create
 * route, so the prefill assertion exercises production code) — this suite
 * proves where the Calendar sends you, not what Booking detail renders.
 */
export function renderCalendar(options: RenderCalendarOptions = {}): RenderedCalendar {
  const {
    path = "/calendar",
    permissions = CALENDAR_CAPABILITIES,
    workspaceId = WORKSPACE_ID,
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  } = options;

  queryClient.setQueryData(meKey(), meFixture(permissions, workspaceId));

  const router = createMemoryRouter(
    [
      { path: "/calendar", element: <CalendarRoute /> },
      { path: "/bookings/new", element: <CreateBookingRoute /> },
      { path: "/bookings/:bookingId", element: <h1>Booking detail stand-in</h1> },
    ],
    { initialEntries: [path] },
  );

  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
    user,
    currentPath: () => {
      const { pathname, search } = router.state.location;
      return `${pathname}${search}`;
    },
  };
}

/** jsdom has no matchMedia; components that read it must not throw. */
export function mockViewport(matchesQuery: (query: string) => boolean): void {
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
