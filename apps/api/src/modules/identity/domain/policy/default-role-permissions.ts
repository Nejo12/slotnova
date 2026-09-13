import { MEMBERS_INVITE, MEMBERS_MANAGE } from "./capabilities.js";

export type MembershipRole = "owner" | "admin" | "manager" | "staff";
export type InvitableRole = Exclude<MembershipRole, "owner">;

/** Canonical Phase-1 permission defaults applied when a membership is created. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<MembershipRole, readonly string[]>> = {
  owner: [MEMBERS_INVITE, MEMBERS_MANAGE],
  admin: [MEMBERS_INVITE, MEMBERS_MANAGE],
  manager: [],
  staff: [],
};

export function defaultPermissionsForRole(role: MembershipRole): readonly string[] {
  return DEFAULT_ROLE_PERMISSIONS[role];
}
