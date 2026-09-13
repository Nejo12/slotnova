/**
 * `application/problem+json` shape (RFC 9457) — the single error format for
 * every Slotnova API response that is not a success
 * (`specs/001-platform-foundation-shell/contracts/problem+json.contract.md`,
 * FR-037). The frontend branches on `type` only, never on `detail`/`title`
 * text, and never sees server-internal detail (stack traces, SQL, secrets).
 */

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
  | "rate-limited"
  | "not-found"
  | "internal";

export interface ProblemValidationError {
  readonly path: string;
  readonly message: string;
}

/** The response body shape. `instance` is filled in by the filter from the active request's correlation id. */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly errors?: readonly ProblemValidationError[];
  readonly requiredCapability?: string;
  readonly checks?: Readonly<Record<string, string>>;
}

export function problemTypeUrl(slug: ProblemSlug): string {
  return `${PROBLEM_BASE_URL}/${slug}`;
}

export function requestInstanceUrl(requestId: string): string {
  return `${REQUEST_BASE_URL}/${requestId}`;
}
