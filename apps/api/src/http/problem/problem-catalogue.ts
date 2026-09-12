import type { ProblemSlug } from "./problem-types.js";

/**
 * Phase 1 problem catalogue — stable `title` + default `status` per slug
 * (`contracts/problem+json.contract.md`). Endpoints beyond health (sessions,
 * invitations, authorization) arrive in later PRs; their slugs are declared
 * here now so the catalogue matches the accepted contract, but nothing in
 * this PR throws them yet.
 */
export const PROBLEM_CATALOGUE: Readonly<Record<ProblemSlug, { title: string; status: number }>> = {
  validation: { title: "The request could not be validated.", status: 400 },
  "invalid-credentials": { title: "The supplied credentials are invalid.", status: 401 },
  "session-invalid": { title: "The session is missing, expired, or revoked.", status: 401 },
  "user-disabled": { title: "This user account is disabled.", status: 403 },
  forbidden: { title: "You do not have permission to perform this action.", status: 403 },
  "email-mismatch": {
    title: "The invitation email does not match the signed-in user.",
    status: 403,
  },
  "not-a-member": { title: "You are not a member of this workspace.", status: 403 },
  "not-ready": { title: "The service is not ready to accept traffic.", status: 503 },
  "invitation-not-found": { title: "The invitation could not be found.", status: 404 },
  "invitation-expired": { title: "The invitation has expired.", status: 410 },
  "invitation-exists": {
    title: "A pending invitation already exists for this address.",
    status: 409,
  },
  "already-member": { title: "This user is already a member of the workspace.", status: 409 },
  "workspace-unavailable": { title: "The workspace is not available.", status: 409 },
  "rate-limited": { title: "Too many requests.", status: 429 },
  "not-found": { title: "The requested resource could not be found.", status: 404 },
  internal: { title: "An unexpected error occurred.", status: 500 },
};
