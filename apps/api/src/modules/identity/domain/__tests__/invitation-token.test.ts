import { describe, expect, it } from "vitest";

import { generateInvitationToken, hashInvitationToken } from "../invitation-token.js";

describe("invitation token", () => {
  it("generates independent 256-bit base64url capabilities", () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("hashes deterministically without retaining the raw token", () => {
    const raw = generateInvitationToken();
    const hash = hashInvitationToken(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(raw);
    expect(hashInvitationToken(raw)).toBe(hash);
  });
});
