/**
 * Route paths. Every path here has a corresponding route.
 *
 * `booking`/`bookingCreate` and the `bookingDetail` pattern are the
 * Phase-2 PR-08 Booking surface. Everything else is still a T060
 * placeholder with no product behavior. `/calendar` stays a placeholder:
 * Calendar composition/UI is PR-09's, and PR-08 only provides the Booking
 * routes PR-09 will later navigate into.
 */
export const ROUTES = {
  home: "/",
  calendar: "/calendar",
  booking: "/bookings",
  bookingCreate: "/bookings/new",
  /** Route pattern — build a concrete path with {@link bookingDetailPath}. */
  bookingDetail: "/bookings/:bookingId",
  clients: "/clients",
  recovery: "/recovery",
  messaging: "/messaging",
  payments: "/payments",
  staff: "/staff",
  inventory: "/inventory",
  marketing: "/marketing",
  analytics: "/analytics",
  settings: "/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;

export function bookingDetailPath(bookingId: string): string {
  return `/bookings/${encodeURIComponent(bookingId)}`;
}
