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
  /**
   * A client-supplied `Idempotency-Key` was replayed with a materially
   * different request body (Phase-2 PR-02,
   * `apps/api/src/modules/platform/idempotency/idempotency-errors.ts`). 409
   * matches the catalogue's existing "your request conflicts with durable
   * state" slugs rather than inventing a new status class.
   */
  "idempotency-conflict": {
    title: "This idempotency key was already used with a different request.",
    status: 409,
  },
  /**
   * The three Booking conflict classes `contracts/booking.contract.md`'s
   * "Problem+json conflict types" table names, at the 409 that table gives
   * each of them (Phase-2 PR-07, issue #73). They are deliberately three
   * separate slugs rather than one shared `conflict`: the accepted
   * `data-model.md` requires "distinct `type` URIs in the problem body ... so
   * clients can branch UX correctly" — refetch-and-retry for a stale write,
   * pick-another-slot for an overlap, refresh-the-view for a command that is
   * no longer legal. They carry no Booking vocabulary in this file beyond the
   * slug itself, exactly like `idempotency-conflict` carries none of
   * Catalog's.
   */
  "booking-overlap": {
    title: "That time overlaps an existing booking.",
    status: 409,
  },
  "stale-write": {
    title: "This record changed since you loaded it.",
    status: 409,
  },
  "invalid-transition": {
    title: "That action is not valid from the record's current state.",
    status: 409,
  },
  "rate-limited": { title: "Too many requests.", status: 429 },
  "not-found": { title: "The requested resource could not be found.", status: 404 },
  internal: { title: "An unexpected error occurred.", status: 500 },
};
