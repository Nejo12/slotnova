/**
 * Problem+json branching for the Calendar surface.
 *
 * The UI branches ONLY on the stable `type` slug the API contract
 * guarantees (`https://slotnova.app/problems/<slug>`,
 * `contracts/problem+json.contract.md`) — never on `title`/`detail`, which
 * are human-readable and may be localised or reworded at any time. An
 * unrecognised or absent `type` degrades to `"unknown"` and is rendered as
 * the generic failure state rather than being guessed at from the status
 * code.
 *
 * The slug list is deliberately SHORTER than the Booking surface's: this
 * surface is one read, so it has no overlap/stale-write/idempotency
 * vocabulary to render. Each feature declares the problems it gives a
 * distinct experience to — that is the convention `booking/api/problem.ts`
 * established, not accidental duplication.
 */
import type { ProblemDetails } from "./types.js";

/** Problem slugs this surface renders a distinct experience for. */
export const CALENDAR_PROBLEM_KINDS = [
  "validation",
  "session-invalid",
  "forbidden",
  "rate-limited",
  "internal",
] as const;

export type ProblemKind = (typeof CALENDAR_PROBLEM_KINDS)[number] | "unknown";

const KNOWN = new Set<string>(CALENDAR_PROBLEM_KINDS);

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string"
  );
}

/**
 * The slug is the last path segment of the problem `type` URI. Parsing the
 * segment (rather than string-matching a hard-coded absolute URI) keeps the
 * client working if the problem base URL ever changes, while still reading
 * only the machine-readable field.
 */
export function problemKindOf(body: unknown): ProblemKind {
  if (!isProblemDetails(body)) return "unknown";
  const segments = body.type.split("/");
  const slug = segments[segments.length - 1] ?? "";
  return KNOWN.has(slug) ? (slug as ProblemKind) : "unknown";
}

/**
 * Every non-2xx API response on this surface surfaces as one of these.
 * `kind` is what the UI switches on; `problem` is kept for diagnostics and
 * for `requiredCapability`, which the API supplies on `forbidden` — the
 * Calendar endpoint reports whichever of `booking:read`/`scheduling:read`
 * the caller is actually missing.
 */
export class ApiProblemError extends Error {
  readonly kind: ProblemKind;
  readonly status: number;
  readonly problem: ProblemDetails | undefined;

  constructor(body: unknown, status: number) {
    super(`API request failed (${String(status)})`);
    this.name = "ApiProblemError";
    this.status = status;
    this.kind = problemKindOf(body);
    this.problem = isProblemDetails(body) ? body : undefined;
  }
}

/** Transport-level failure (offline, DNS, aborted) — no problem body exists. */
export class ApiTransportError extends Error {
  constructor(cause: unknown) {
    super("The request could not be delivered");
    this.name = "ApiTransportError";
    this.cause = cause;
  }
}
