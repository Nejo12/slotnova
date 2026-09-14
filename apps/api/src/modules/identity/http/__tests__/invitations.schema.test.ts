import { describe, expect, it } from "vitest";

import { InvitationPreviewRateLimiter } from "../invitation-preview-rate-limiter.js";
import { parseIssueInvitationBody, parseRevokeInvitationBody } from "../invitations.schema.js";

describe("invitation HTTP boundary", () => {
  it("normalizes a valid issue body", () => {
    expect(parseIssueInvitationBody({ email: " Invitee@Example.COM ", role: "manager" })).toEqual({
      email: "invitee@example.com",
      role: "manager",
    });
  });

  it("rejects owner and malformed input", () => {
    expect(() => parseIssueInvitationBody({ email: "x@example.test", role: "owner" })).toThrow();
    expect(() => parseIssueInvitationBody({ email: "bad", role: "staff" })).toThrow();
    expect(() => parseRevokeInvitationBody({ status: "accepted" })).toThrow();
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
