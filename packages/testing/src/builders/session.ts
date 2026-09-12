import { applyOverride, type Override } from "./override.js";
import { testId, testTimestamp } from "./ids.js";

/**
 * Test-data shape for an authenticated session. Fixture contract only — the real
 * session model (rotation, storage, expiry policy) is ADR-007.
 */
export interface SessionShape {
  readonly id: string;
  readonly userId: string;
  /** Workspace the session is currently scoped to, or `null` before first selection. */
  readonly activeWorkspaceId: string | null;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

const SESSION_TTL_MINUTES = 60;

/** Valid-by-default session: issued at the test epoch, unexpired. Fresh object per call. */
export function buildSession(override?: Override<SessionShape>): SessionShape {
  return applyOverride(
    {
      id: testId("session"),
      userId: testId("user"),
      activeWorkspaceId: testId("workspace"),
      issuedAt: testTimestamp(),
      expiresAt: testTimestamp(SESSION_TTL_MINUTES),
    },
    override,
  );
}
