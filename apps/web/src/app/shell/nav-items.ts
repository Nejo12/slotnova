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
 * "18 — Prototypes" shell sidebar (node 340:4) exactly. Figma's sidebar
 * additionally shows a standalone "Booking" item; T060's placeholder-route
 * list does not include one (Booking is Phase 2 product behavior, out of
 * scope per the constitution's scope guard), so it is deliberately omitted
 * here rather than inventing a placeholder Figma doesn't require — see the
 * PR description for this reasoned Figma/tasks divergence.
 */
export const DESKTOP_NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Today & customers",
    items: [
      { key: "home", label: "Home", path: ROUTES.home },
      { key: "calendar", label: "Calendar", path: ROUTES.calendar },
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
  { key: "messaging", label: "Messaging", path: ROUTES.messaging },
  { key: "payments", label: "Payments & POS", path: ROUTES.payments },
  { key: "staff", label: "Staff", path: ROUTES.staff },
  { key: "inventory", label: "Inventory", path: ROUTES.inventory },
  { key: "marketing", label: "Marketing & Retention", path: ROUTES.marketing },
  { key: "analytics", label: "Analytics", path: ROUTES.analytics },
  { key: "settings", label: "Settings", path: ROUTES.settings },
];
