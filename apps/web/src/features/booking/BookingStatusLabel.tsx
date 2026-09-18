import { Badge, type BadgeTone } from "@slotnova/ui";

import type { BookingStatus } from "./api/types.js";

const PRESENTATION: Readonly<Record<BookingStatus, { label: string; tone: BadgeTone }>> = {
  confirmed: { label: "Confirmed", tone: "success" },
  completed: { label: "Completed", tone: "info" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function bookingStatusLabel(status: BookingStatus): string {
  return PRESENTATION[status].label;
}

/**
 * Booking status, always carried by the WORD first: the badge renders the
 * literal "Confirmed"/"Completed"/"Cancelled" text, and tone is only a
 * secondary reinforcement. Nothing on this surface distinguishes a status
 * by colour alone (hard product invariant, docs/product-handoff.md).
 *
 * Note the Phase-2 server lifecycle is exactly these three states — there
 * is no Pending/Draft status to render, because none is ever persisted.
 */
export function BookingStatusLabel({ status }: { status: BookingStatus }): React.JSX.Element {
  const { label, tone } = PRESENTATION[status];
  return <Badge tone={tone}>{label}</Badge>;
}
