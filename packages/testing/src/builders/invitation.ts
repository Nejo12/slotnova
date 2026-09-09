import { applyOverride, type Override } from "./override.js";
import { type MembershipRole } from "./membership.js";
import { testId, testTimestamp } from "./ids.js";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/**
 * Test-data shape for a workspace invitation. Fixture contract only. Defaults
 * describe a fresh, still-pending invite from the default workspace owner.
 */
export interface InvitationShape {
  readonly id: string;
  readonly workspaceId: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly status: InvitationStatus;
  readonly invitedByUserId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

const INVITATION_TTL_MINUTES = 7 * 24 * 60;

/** Valid-by-default invitation (`pending`, role `member`). Fresh object per call. */
export function buildInvitation(override?: Override<InvitationShape>): InvitationShape {
  return applyOverride(
    {
      id: testId("invitation"),
      workspaceId: testId("workspace"),
      email: "grace@example.test",
      role: "member",
      status: "pending",
      invitedByUserId: testId("user"),
      createdAt: testTimestamp(),
      expiresAt: testTimestamp(INVITATION_TTL_MINUTES),
    },
    override,
  );
}
