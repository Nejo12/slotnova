import { createBrowserRouter, type RouteObject } from "react-router";

import { BookingHomeRoute } from "../features/booking/BookingHomeRoute.js";
import { CreateBookingRoute } from "../features/booking/create/CreateBookingRoute.js";
import { BookingDetailRoute } from "../features/booking/detail/BookingDetailRoute.js";
import { PlaceholderRoute } from "./routes/PlaceholderRoute.js";
import { ROUTES } from "./routes/routes.js";
import { ShellLayout } from "./shell/ShellLayout.js";

const shellRoutes: RouteObject = {
  path: ROUTES.home,
  element: <ShellLayout />,
  children: [
    { index: true, element: <PlaceholderRoute destination="Home" /> },
    { path: "calendar", element: <PlaceholderRoute destination="Calendar" /> },
    // Phase-2 PR-08 Booking surface. `new` is declared before `:bookingId`
    // so the literal segment always wins over the dynamic one.
    { path: "bookings", element: <BookingHomeRoute /> },
    { path: "bookings/new", element: <CreateBookingRoute /> },
    { path: "bookings/:bookingId", element: <BookingDetailRoute /> },
    { path: "clients", element: <PlaceholderRoute destination="Clients" /> },
    { path: "recovery", element: <PlaceholderRoute destination="Recovery" /> },
    { path: "messaging", element: <PlaceholderRoute destination="Messaging" /> },
    { path: "payments", element: <PlaceholderRoute destination="Payments" /> },
    { path: "staff", element: <PlaceholderRoute destination="Staff" /> },
    { path: "inventory", element: <PlaceholderRoute destination="Inventory" /> },
    { path: "marketing", element: <PlaceholderRoute destination="Marketing" /> },
    { path: "analytics", element: <PlaceholderRoute destination="Analytics" /> },
    { path: "settings", element: <PlaceholderRoute destination="Settings" /> },
  ],
};

const routes: RouteObject[] = [shellRoutes];

// The test-harness route exists only under VITE_E2E and is dynamically
// imported (`lazy`), so an ordinary production build/route table never
// references — let alone bundles — apps/web/src/test-harness (verified by
// src/__tests__/production-bundle.test.ts). It is used solely to establish
// a session before an E2E journey navigates to the real shell at "/"; no
// journey assertion runs against it (T063).
if (import.meta.env.VITE_E2E === "true") {
  routes.push({
    path: "/__test-harness",
    lazy: async () => {
      const { TestHarness } = await import("../test-harness/TestHarness.js");
      return { Component: TestHarness, HydrateFallback: () => null };
    },
  });
}

/**
 * Router tree (T058, ADR-003: `createBrowserRouter`). Route modules here
 * own only routing/gating/prefetch — no business invariants. Every T060
 * placeholder destination is reachable and deep-linkable; none fetch
 * product data or contain product logic.
 */
export const router = createBrowserRouter(routes);
