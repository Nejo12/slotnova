/**
 * Boundary request/response shapes for `POST|DELETE /v1/auth/session`
 * (T038, contracts/session.contract.md). Hand-rolled validation deliberately
 * -- R4 (runtime-validation -> OpenAPI integration) is undecided until T064
 * (PR-15); these shapes are written so that decision can adopt them later
 * without rework, but nothing here wires OpenAPI generation.
 */
import { ProblemException } from "../../../http/problem/problem.exception.js";

export interface SignInRequestBody {
  readonly credential: unknown;
}

export function parseSignInRequestBody(body: unknown): SignInRequestBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ProblemException("validation", {
      errors: [{ path: "", message: "request body must be a JSON object" }],
    });
  }
  if (!("credential" in body)) {
    throw new ProblemException("validation", {
      errors: [{ path: "credential", message: "credential is required" }],
    });
  }
  const { credential } = body as { credential: unknown };
  if (typeof credential !== "object" || credential === null || Array.isArray(credential)) {
    throw new ProblemException("validation", {
      errors: [{ path: "credential", message: "credential must be an object" }],
    });
  }
  return { credential };
}

export interface UserResponseDto {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

export interface WorkspaceSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export interface SignInResponseBody {
  readonly user: UserResponseDto;
  readonly activeWorkspace: WorkspaceSummaryDto | null;
  readonly workspaces: readonly WorkspaceSummaryDto[];
}
