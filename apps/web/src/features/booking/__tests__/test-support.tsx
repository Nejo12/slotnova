import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import { ThemeProvider } from "../../../app/providers/ThemeProvider.js";
import { meKey } from "../../../app/query/keys.js";
import type { MeResponse } from "../../../app/auth/session-api.js";
import { BookingHomeRoute } from "../BookingHomeRoute.js";
import { CreateBookingRoute } from "../create/CreateBookingRoute.js";
import { BookingDetailRoute } from "../detail/BookingDetailRoute.js";
import type { Booking, ProblemDetails, ServiceListItem } from "../api/types.js";

/**
 * The origin the Booking API client talks to under test. It matches
 * `booking-api.ts`'s default (`VITE_API_URL` is not defined in a unit run)
 * and is a local host, so the global network denylist
 * (`@slotnova/testing/msw/deny-network`) permits MSW to answer it.
 */
export const API_ORIGIN = "http://localhost:3001";

export const WORKSPACE_ID = "workspace-a";

/** Every capability the Booking surface reads, as the API contract names them. */
export const ALL_BOOKING_CAPABILITIES = [
  "catalog:read",
  "booking:read",
  "booking:create",
  "booking:edit",
  "booking:cancel",
  "booking:complete",
];

export function meFixture(permissions: readonly string[]): MeResponse {
  return {
    user: { id: "user-1", displayName: "Alex Morgan", email: "owner@example.test" },
    activeWorkspace: {
      id: WORKSPACE_ID,
      name: "Alpha Workspace",
      role: "owner",
      permissions: [...permissions],
    },
    workspaces: [{ id: WORKSPACE_ID, name: "Alpha Workspace", role: "owner" }],
    session: { expiresAt: "2099-01-01T00:00:00Z" },
  };
}

export const HAIRCUT: ServiceListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Haircut",
  categoryId: null,
  durationMinutes: 45,
  preBufferMinutes: 5,
  postBufferMinutes: 10,
  priceAmountMinor: 4500,
  priceCurrency: "EUR",
  active: true,
};

export const COLOUR: ServiceListItem = {
  ...HAIRCUT,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Colour treatment",
  durationMinutes: 90,
};

export const RETIRED: ServiceListItem = {
  ...HAIRCUT,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Retired service",
  active: false,
};

export function bookingFixture(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    serviceId: HAIRCUT.id,
    startsAt: "2026-10-01T09:00:00.000Z",
    serviceDurationMinutes: 45,
    preBufferMinutes: 5,
    postBufferMinutes: 10,
    blockingRange: { start: "2026-10-01T08:55:00.000Z", end: "2026-10-01T09:55:00.000Z" },
    status: "confirmed",
    version: 1,
    // The generated contract renders this nullable field as an array (a
    // known OpenAPI-generation defect noted in the PR description); this
    // surface never reads it, and the fixture keeps the generated shape so
    // the type still proves alignment.
    cancelledReason: [],
    ...overrides,
  };
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

export interface RenderBookingOptions {
  path?: string;
  permissions?: readonly string[];
}

export interface RenderedBooking extends RenderResult {
  queryClient: QueryClient;
  user: UserEvent;
}

/**
 * Renders the real Booking routes behind a real data router and a
 * pre-seeded signed-in session, exactly as the shell would. The `me` entry
 * is seeded rather than fetched so a suite exercises Booking behaviour,
 * not session bootstrap (the same approach the shell's own tests use).
 */
export function renderBooking(options: RenderBookingOptions = {}): RenderedBooking {
  const { path = "/bookings/new", permissions = ALL_BOOKING_CAPABILITIES } = options;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(meKey(), meFixture(permissions));

  const router = createMemoryRouter(
    [
      { path: "/bookings", element: <BookingHomeRoute /> },
      { path: "/bookings/new", element: <CreateBookingRoute /> },
      { path: "/bookings/:bookingId", element: <BookingDetailRoute /> },
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

  return { ...result, queryClient, user };
}

/**
 * jsdom does not implement the native `<dialog>` modal methods Nova's
 * Dialog calls. Polyfilling their `open`-attribute side effects lets the
 * component's own focus/keyboard logic run unmodified — the same approach
 * `packages/ui/src/__tests__/dialog-consumption.test.tsx` already uses.
 */
export function installDialogPolyfill(): void {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
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
