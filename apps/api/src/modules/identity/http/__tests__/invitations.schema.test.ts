import { describe, expect, it } from "vitest";

import { InvitationPreviewRateLimiter } from "../invitation-preview-rate-limiter.js";
import {
  issueInvitationRequestSchema,
  revokeInvitationRequestSchema,
} from "../invitations.schema.js";

/**
 * T064 -- these schemas are now Zod-based
 * (`docs/decisions/0004-validation-contract-integration.md`); this file
 * exercises them the same way the hand-rolled `parse*RequestBody` functions
 * were exercised (`.parse()`/`.safeParse()` in place of the old direct
 * function calls), asserting on success/failure only -- no test here pins
 * exact error message text.
 */
describe("invitation HTTP boundary", () => {
  it("normalizes a valid issue body", () => {
    expect(
      issueInvitationRequestSchema.parse({ email: " Invitee@Example.COM ", role: "manager" }),
    ).toEqual({
      email: "invitee@example.com",
      role: "manager",
    });
  });

  it("rejects owner and malformed input", () => {
    expect(() =>
      issueInvitationRequestSchema.parse({ email: "x@example.test", role: "owner" }),
    ).toThrow();
    expect(() => issueInvitationRequestSchema.parse({ email: "bad", role: "staff" })).toThrow();
    expect(() => revokeInvitationRequestSchema.parse({ status: "accepted" })).toThrow();
  });

  it("enforces independent per-token and per-IP limits", () => {
    const limiter = new InvitationPreviewRateLimiter();
    const token = "a".repeat(43);
    for (let count = 0; count < 20; count += 1) limiter.check(token, "127.0.0.1", 1);
    expect(() => limiter.check(token, "127.0.0.1", 1)).toThrow();
    expect(() => limiter.check(token, "127.0.0.2", 1)).toThrow();
    expect(() => limiter.check("b".repeat(43), "127.0.0.1", 1)).toThrow();
    expect(() => limiter.check("b".repeat(43), "127.0.0.2", 1)).not.toThrow();
    expect(() => limiter.check(token, "127.0.0.1", 60_002)).not.toThrow();
  });
});
