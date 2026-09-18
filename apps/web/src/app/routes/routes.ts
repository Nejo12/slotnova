/**
 * Route paths. Every path here has a corresponding route.
 *
 * `booking`/`bookingCreate` and the `bookingDetail` pattern are the
 * Phase-2 PR-08 Booking surface; `/calendar` is the Phase-2 PR-09 Calendar
 * surface, which navigates into both of them. Everything else is still a
 * T060 placeholder with no product behavior.
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

/**
 * `/calendar`, optionally anchored on a LOCAL day (`?day=YYYY-MM-DD`). The
 * day is the Calendar's only range input and is deep-linkable; an absent or
 * unparseable value degrades to today.
 */
export function calendarDayPath(day?: string): string {
  return day === undefined ? ROUTES.calendar : `/calendar?day=${encodeURIComponent(day)}`;
}

/**
 * `/bookings/new`, optionally PREFILLED with a start instant
 * (`?startsAt=<ISO-8601 instant>`) — the Calendar's "book this open time"
 * entry (PR-09, issue #81).
 *
 * This is deliberately a plain search parameter and nothing more:
 *
 * - it is CLIENT-SIDE ONLY. No draft, no reservation and no server state of
 *   any kind is created by following this link; Phase-2 Booking has no
 *   draft/pending status to create. The create flow remains the source of
 *   truth for what is submitted, and still snapshots the Service and
 *   validates the time server-side;
 * - it DEGRADES SAFELY. An absent, malformed or unparseable value is
 *   ignored and the flow starts with an empty time field — see
 *   `CreateBookingRoute`;
 * - it creates no hidden coupling. There is no shared store, no global
 *   Calendar draft and no cross-feature import: the Calendar writes a URL
 *   and the create flow reads one.
 */
export function bookingCreatePath(prefill?: { startsAt?: string | undefined }): string {
  const startsAt = prefill?.startsAt;
  if (startsAt === undefined || startsAt === "") return ROUTES.bookingCreate;
  return `${ROUTES.bookingCreate}?startsAt=${encodeURIComponent(startsAt)}`;
}
