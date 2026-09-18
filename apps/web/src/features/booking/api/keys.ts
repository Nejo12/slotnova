/**
 * Booking/Catalog query keys. Every key is built with the shell's `wsKey`
 * factory, so its first two segments are always `"ws"` + the ACTIVE
 * workspace id (`apps/web/src/app/query/keys.ts`). That is what makes the
 * shell's `queryClient.clear()` on workspace switch / logout correct: no
 * Booking or Catalog entry can outlive, or be read across, its owning
 * workspace.
 */
import { wsKey } from "../../../app/query/keys.js";

export function activeServicesKey(workspaceId: string): readonly string[] {
  return wsKey(workspaceId, "catalog", "services", "active");
}

export function serviceKey(workspaceId: string, serviceId: string): readonly string[] {
  return wsKey(workspaceId, "catalog", "services", serviceId);
}

export function bookingKey(workspaceId: string, bookingId: string): readonly string[] {
  return wsKey(workspaceId, "booking", "bookings", bookingId);
}
