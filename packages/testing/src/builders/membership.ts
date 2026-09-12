import { applyOverride, type Override } from "./override.js";
import { testId, testTimestamp } from "./ids.js";

/** Workspace roles used by fixtures. The authoritative permission model is ADR-009. */
export type MembershipRole = "owner" | "admin" | "member";

/**
 * Test-data shape for a user's membership of a workspace. Fixture contract only.
 * Defaults reference the default {@link buildWorkspace}/{@link buildUser} ids so
 * a lone `buildMembership()` is internally consistent; compose explicitly when
 * the ids matter.
 */
export interface MembershipShape {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly createdAt: string;
}

/** Valid-by-default membership (role `member`). Fresh object per call. */
export function buildMembership(override?: Override<MembershipShape>): MembershipShape {
  return applyOverride(
    {
      id: testId("membership"),
      workspaceId: testId("workspace"),
      userId: testId("user"),
      role: "member",
      createdAt: testTimestamp(),
    },
    override,
  );
}
