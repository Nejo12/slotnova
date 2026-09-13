/**
 * Boundary request parsing for `POST /v1/auth/session/workspace` (T042,
 * contracts/workspace-context.contract.md). Same hand-rolled-validation
 * posture as `session.schema.ts` (R4 undecided until T064).
 */
import { ProblemException } from "../../../http/problem/problem.exception.js";

export interface WorkspaceSwitchRequestBody {
  readonly workspaceId: string;
}

export function parseWorkspaceSwitchRequestBody(body: unknown): WorkspaceSwitchRequestBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ProblemException("validation", {
      errors: [{ path: "", message: "request body must be a JSON object" }],
    });
  }
  if (!("workspaceId" in body)) {
    throw new ProblemException("validation", {
      errors: [{ path: "workspaceId", message: "workspaceId is required" }],
    });
  }
  const { workspaceId } = body as { workspaceId: unknown };
  if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
    throw new ProblemException("validation", {
      errors: [{ path: "workspaceId", message: "workspaceId must be a non-empty string" }],
    });
  }
  return { workspaceId };
}
