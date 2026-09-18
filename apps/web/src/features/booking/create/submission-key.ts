/**
 * `Idempotency-Key` lifecycle for `POST /v1/bookings`.
 *
 * The rule, stated once and enforced in one place:
 *
 * - one key per INTENDED creation (a specific Service at a specific
 *   instant). Retrying the exact same intent — a dropped connection, a
 *   500, the operator pressing "Try again" without editing anything —
 *   MUST reuse that key, so the server replays its original response and
 *   never creates a second booking (and never raises a spurious overlap
 *   against the booking it already created).
 * - materially editing the Service or the time makes it a DIFFERENT
 *   intent, so the next attempt must carry a NEW key. Reusing the old one
 *   with a changed body is what the API answers `idempotency-conflict` to.
 *
 * "Materially different" is expressed as a signature over exactly the two
 * fields the request body carries. Nothing else can affect the key.
 */

export interface SubmissionKey {
  readonly key: string;
  /** The intent this key was minted for. */
  readonly signature: string;
}

export interface SubmissionIntent {
  readonly serviceId: string;
  readonly startsAt: string;
}

export function submissionSignature(intent: SubmissionIntent): string {
  return `${intent.serviceId}@${intent.startsAt}`;
}

/**
 * Returns the key to send for `intent`: the current one when the intent is
 * unchanged, otherwise a freshly generated one. `generate` is injected so
 * tests are deterministic — production passes `crypto.randomUUID`.
 */
export function keyForIntent(
  current: SubmissionKey | null,
  intent: SubmissionIntent,
  generate: () => string,
): SubmissionKey {
  const signature = submissionSignature(intent);
  if (current !== null && current.signature === signature) return current;
  return { key: generate(), signature };
}

/** Production key source. */
export function randomSubmissionKey(): string {
  return crypto.randomUUID();
}
