import { ROUTES } from "../routes/routes.js";

export interface NavItem {
  key: string;
  label: string;
  path: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * Desktop navigation IA (T059). Grouping follows the canonical Figma
 * "18 — Prototypes" shell sidebar (node 340:4) exactly, including the
 * standalone "Booking" item that sidebar shows. That item was deliberately
 * omitted in Phase 1 because Booking is Phase-2 product behavior and no
 * route existed to point it at; Phase-2 PR-08 adds the Booking surface, so
 * the sidebar now matches Figma rather than diverging from it. No other
 * navigation grouping, label or order changed.
 */
export const DESKTOP_NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Today & customers",
    items: [
      { key: "home", label: "Home", path: ROUTES.home },
      { key: "calendar", label: "Calendar", path: ROUTES.calendar },
      { key: "booking", label: "Booking", path: ROUTES.booking },
      { key: "clients", label: "Clients", path: ROUTES.clients },
      { key: "recovery", label: "Recovery", path: ROUTES.recovery },
      { key: "messaging", label: "Messaging", path: ROUTES.messaging },
    ],
  },
  {
    label: "Commerce",
    items: [
      { key: "payments", label: "Payments & POS", path: ROUTES.payments },
      { key: "inventory", label: "Inventory", path: ROUTES.inventory },
    ],
  },
  {
    label: "Growth & insights",
    items: [
      { key: "marketing", label: "Marketing & Retention", path: ROUTES.marketing },
      { key: "analytics", label: "Analytics", path: ROUTES.analytics },
    ],
  },
  {
    label: "Operations",
    items: [{ key: "staff", label: "Staff", path: ROUTES.staff }],
  },
  {
    label: "System",
    items: [{ key: "settings", label: "Settings", path: ROUTES.settings }],
  },
];

/**
 * Mobile primary navigation (hard product invariant, AGENTS.md): exactly
 * Home · Calendar · Clients · Recovery · More. All remaining destinations
 * live under "More" — a deliberate mobile substitution, not a compressed
 * desktop sidebar.
 */
export const MOBILE_PRIMARY_NAV: readonly NavItem[] = [
  { key: "home", label: "Home", path: ROUTES.home },
  { key: "calendar", label: "Calendar", path: ROUTES.calendar },
  { key: "clients", label: "Clients", path: ROUTES.clients },
  { key: "recovery", label: "Recovery", path: ROUTES.recovery },
];

/** Every destination not in the mobile primary nav, reachable under "More". */
export const MOBILE_MORE_NAV: readonly NavItem[] = [
  // Booking lives under "More" on mobile: the five-item primary bar is a
  // hard product invariant (Home · Calendar · Clients · Recovery · More)
  // and is not renegotiated by a new product surface.
  { key: "booking", label: "Booking", path: ROUTES.booking },
  { key: "messaging", label: "Messaging", path: ROUTES.messaging },
  { key: "payments", label: "Payments & POS", path: ROUTES.payments },
  { key: "staff", label: "Staff", path: ROUTES.staff },
  { key: "inventory", label: "Inventory", path: ROUTES.inventory },
  { key: "marketing", label: "Marketing & Retention", path: ROUTES.marketing },
  { key: "analytics", label: "Analytics", path: ROUTES.analytics },
  { key: "settings", label: "Settings", path: ROUTES.settings },
];
