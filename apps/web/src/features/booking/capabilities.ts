/**
 * Booking/Catalog capability slugs, as the API's own endpoint contract
 * declares them (`apps/api/src/modules/booking/http/bookings.controller.ts`
 * and the OpenAPI 403 descriptions). They are duplicated here as strings
 * only because the frontend must not import server code — the values
 * themselves come from the contract, not from an invented role model.
 *
 * These gate RENDERING ONLY. The server's `CapabilityGuard` is the security
 * boundary; a hidden control is a usability affordance, never enforcement,
 * and a 403 is still rendered as a permission state if one slips through.
 * No role -> capability mapping is inferred anywhere on this surface: the
 * only input is the authoritative `permissions` array `GET /v1/me` returns
 * for the active workspace.
 */
import type { ActiveWorkspace } from "../../app/auth/session-api.js";

export const CATALOG_READ = "catalog:read";
export const BOOKING_READ = "booking:read";
export const BOOKING_CREATE = "booking:create";
export const BOOKING_EDIT = "booking:edit";
export const BOOKING_CANCEL = "booking:cancel";
export const BOOKING_COMPLETE = "booking:complete";

export function hasCapability(
  workspace: ActiveWorkspace | null | undefined,
  capability: string,
): boolean {
  return workspace?.permissions.includes(capability) ?? false;
}
