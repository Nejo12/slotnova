import type { OutboxHandler } from "../dispatch.js";

const fields: Record<string, readonly string[]> = {
  "invitation.issued": ["invitationId", "role"],
  "invitation.accepted": ["invitationId", "membershipId"],
  "membership.created": ["membershipId", "role"],
};

/** Phase 1 has no downstream product effect. Validate the catalogue contract
 * and acknowledge it. Repeating this handler has no business effect; delivery
 * logs may repeat. Crash tests inject a durable, idempotent test-only effect. */
export const handleIdentityEvent: OutboxHandler = async (record) => {
  const required = fields[record.event_name];
  if (record.event_version !== 1 || !required) throw new Error("unsupported outbox event/version");
  for (const field of required) {
    if (typeof record.payload[field] !== "string" || !record.payload[field]) {
      throw new Error(`invalid identity event field: ${field}`);
    }
  }
};
