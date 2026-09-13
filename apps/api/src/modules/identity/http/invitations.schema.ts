import { ProblemException } from "../../../http/problem/problem.exception.js";
import type { InvitableRole } from "../domain/policy/default-role-permissions.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITABLE_ROLES = new Set<InvitableRole>(["admin", "manager", "staff"]);

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ProblemException("validation", {
      errors: [{ path: "", message: "request body must be a JSON object" }],
    });
  }
  return body as Record<string, unknown>;
}

export function parseIssueInvitationBody(body: unknown): {
  email: string;
  role: InvitableRole;
} {
  const value = objectBody(body);
  const email = typeof value["email"] === "string" ? value["email"].trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new ProblemException("validation", {
      errors: [{ path: "email", message: "email must be a valid address" }],
    });
  }
  const role = value["role"];
  if (typeof role !== "string" || !INVITABLE_ROLES.has(role as InvitableRole)) {
    throw new ProblemException("validation", {
      errors: [{ path: "role", message: "role must be admin, manager, or staff" }],
    });
  }
  return { email, role: role as InvitableRole };
}

export function parseRevokeInvitationBody(body: unknown): void {
  const value = objectBody(body);
  if (value["status"] !== "revoked") {
    throw new ProblemException("validation", {
      errors: [{ path: "status", message: "status must be revoked" }],
    });
  }
}

export function parseInvitationId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new ProblemException("validation", {
      errors: [{ path: "id", message: "id must be a valid UUID" }],
    });
  }
  return id;
}
