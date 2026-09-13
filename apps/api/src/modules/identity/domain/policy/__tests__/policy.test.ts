/**
 * T041/T043 — server-authoritative authorization policy, proven as a table-
 * driven role x capability matrix (ADR-009). `authorize()` reads ONLY the
 * membership's own `permissions` list -- `AuthorizationSubject` has no
 * `role` field at all, so a provider-supplied role claim cannot even be
 * passed through this function by accident (structural proof, not just a
 * runtime check).
 */
import { describe, expect, it } from "vitest";

import { authorize, type AuthorizationSubject } from "../authorize.js";
import { MEMBERS_INVITE, MEMBERS_MANAGE } from "../capabilities.js";
import { DEFAULT_ROLE_PERMISSIONS, type MembershipRole } from "../default-role-permissions.js";

/**
 * Canonical Phase-1 permission sets used for membership creation.
 * `authorize()` still never reads `role`; only the explicit permissions
 * persisted on the membership are authoritative (T043 requirement).
 */
const ROLES: readonly MembershipRole[] = ["owner", "admin", "manager", "staff"];
const ACTIONS = [MEMBERS_INVITE, MEMBERS_MANAGE] as const;

function subjectFor(
  role: MembershipRole,
  overrides: Partial<AuthorizationSubject> = {},
): AuthorizationSubject {
  return {
    membershipStatus: "active",
    workspaceStatus: "active",
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
    ...overrides,
  };
}

describe("authorize() -- role x protected-foundation-action matrix (T043)", () => {
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      const expected = DEFAULT_ROLE_PERMISSIONS[role].includes(action);
      it(`${role} ${expected ? "is allowed" : "is denied"} '${action}'`, () => {
        expect(authorize(subjectFor(role), action)).toBe(expected);
      });
    }
  }
});

describe("authorize() -- capability grant / deny", () => {
  it("allows when the membership's own permissions list includes the capability", () => {
    expect(authorize(subjectFor("owner"), MEMBERS_INVITE)).toBe(true);
  });

  it("denies when the capability is absent from the membership's permissions", () => {
    expect(authorize(subjectFor("staff"), MEMBERS_INVITE)).toBe(false);
  });
});

describe("authorize() -- inactive/suspended context cannot authorize", () => {
  it("denies when the membership is suspended, even while holding the capability", () => {
    expect(authorize(subjectFor("owner", { membershipStatus: "suspended" }), MEMBERS_INVITE)).toBe(
      false,
    );
  });

  it("denies when the workspace is suspended, even while holding the capability", () => {
    expect(authorize(subjectFor("owner", { workspaceStatus: "suspended" }), MEMBERS_INVITE)).toBe(
      false,
    );
  });
});

describe("authorize() -- provider role claims cannot elevate authorization", () => {
  it("has no role/claims field to read -- only `permissions` decides the outcome", () => {
    const subject: AuthorizationSubject = {
      membershipStatus: "active",
      workspaceStatus: "active",
      permissions: [],
    };
    expect(authorize(subject, MEMBERS_INVITE)).toBe(false);
  });
});

describe("authorize() -- deterministic, independent of UI state", () => {
  it("returns the same result for the same input across repeated calls", () => {
    const subject = subjectFor("admin");
    const results = Array.from({ length: 5 }, () => authorize(subject, MEMBERS_MANAGE));
    expect(new Set(results).size).toBe(1);
  });
});
