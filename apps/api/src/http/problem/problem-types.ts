/**
 * `application/problem+json` shape (RFC 9457) — the single error format for
 * every Slotnova API response that is not a success
 * (`specs/001-platform-foundation-shell/contracts/problem+json.contract.md`,
 * FR-037). The frontend branches on `type` only, never on `detail`/`title`
 * text, and never sees server-internal detail (stack traces, SQL, secrets).
 */
import type { z } from "zod";

import type { problemDetailsSchema } from "./problem-details.schema.js";

export const PROBLEM_BASE_URL = "https://slotnova.app/problems";
export const REQUEST_BASE_URL = "https://slotnova.app/requests";

/** Stable per-failure-class slug. Every new failure class documents one here. */
export type ProblemSlug =
  | "validation"
  | "invalid-credentials"
  | "session-invalid"
  | "user-disabled"
  | "forbidden"
  | "email-mismatch"
  | "not-a-member"
  | "not-ready"
  | "invitation-not-found"
  | "invitation-expired"
  | "invitation-exists"
  | "already-member"
  | "workspace-unavailable"
  | "idempotency-conflict"
  | "booking-overlap"
  | "stale-write"
  | "invalid-transition"
  | "rate-limited"
  | "not-found"
  | "internal";

export interface ProblemValidationError {
  readonly path: string;
  readonly message: string;
}

/**
 * The response body shape. `instance` is filled in by the filter from the
 * active request's correlation id.
 *
 * Derived from {@link problemDetailsSchema} (`./problem-details.schema.ts`)
 * -- that Zod schema is the single source of truth (it is also what every
 * controller's OpenAPI error `@ApiResponse` decorator references), and this
 * interface is kept as a `z.infer<>` alias rather than a hand-maintained
 * second declaration so the two can never drift.
 */
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function problemTypeUrl(slug: ProblemSlug): string {
  return `${PROBLEM_BASE_URL}/${slug}`;
}

export function requestInstanceUrl(requestId: string): string {
  return `${REQUEST_BASE_URL}/${requestId}`;
}
