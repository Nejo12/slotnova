/**
 * Calendar capability slugs, as the API's own endpoint contract declares
 * them (`apps/api/src/modules/calendar-read/http/calendar.controller.ts` and
 * the OpenAPI 403 description). They are duplicated here as strings only
 * because the frontend must not import server code — the values themselves
 * come from the contract, not from an invented role model.
 *
 * Reading the Calendar needs BOTH `booking:read` AND `scheduling:read`: the
 * endpoint composes two surfaces and grants access to neither. Entering the
 * Booking create flow from an open slot additionally needs `booking:create`,
 * which is why that one affordance is gated separately.
 *
 * These gate RENDERING ONLY. The server's `CapabilityGuard` is the security
 * boundary; a hidden control is a usability affordance, never enforcement,
 * and a 403 is still rendered as a permission state if one slips through.
 * No role -> capability mapping is inferred anywhere on this surface: the
 * only input is the authoritative `permissions` array `GET /v1/me` returns
 * for the active workspace.
 */
import type { ActiveWorkspace } from "../../app/auth/session-api.js";

export const BOOKING_READ = "booking:read";
export const SCHEDULING_READ = "scheduling:read";
export const BOOKING_CREATE = "booking:create";

/** Both, and the order the server reports a missing one in. */
export const CALENDAR_READ_CAPABILITIES = [BOOKING_READ, SCHEDULING_READ] as const;

export function hasCapability(
  workspace: ActiveWorkspace | null | undefined,
  capability: string,
): boolean {
  return workspace?.permissions.includes(capability) ?? false;
}

/** True only when the workspace grants EVERY capability the read endpoint requires. */
export function canReadCalendar(workspace: ActiveWorkspace | null | undefined): boolean {
  return CALENDAR_READ_CAPABILITIES.every((capability) => hasCapability(workspace, capability));
}
