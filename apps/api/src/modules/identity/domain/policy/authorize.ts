/**
 * Server-authoritative authorization decision (T041, ADR-009, FR-031). Pure
 * and side-effect-free: the same input always returns the same output, and
 * the input never carries a `role` or provider claim -- only the
 * membership's own `permissions` list, `membershipStatus`, and
 * `workspaceStatus`, all sourced from Slotnova-owned data by the caller
 * (never from client input or a credential-adapter claim).
 */
export interface AuthorizationSubject {
  readonly membershipStatus: "active" | "suspended";
  readonly workspaceStatus: "active" | "suspended";
  readonly permissions: readonly string[];
}

export function authorize(subject: AuthorizationSubject, requiredCapability: string): boolean {
  if (subject.membershipStatus !== "active") return false;
  if (subject.workspaceStatus !== "active") return false;
  return subject.permissions.includes(requiredCapability);
}
