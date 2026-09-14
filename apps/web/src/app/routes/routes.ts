/**
 * Placeholder route paths (T060). Every path here has a corresponding
 * empty/coming-later placeholder route — no product behavior.
 */
export const ROUTES = {
  home: "/",
  calendar: "/calendar",
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
