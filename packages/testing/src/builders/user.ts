import { applyOverride, type Override } from "./override.js";
import { testId, testTimestamp } from "./ids.js";

/**
 * Test-data shape for a user (a person, tenant-independent). Fixture contract
 * only — not a domain model or auth/identity schema (ADR-007 owns the real one).
 */
export interface UserShape {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: string;
}

/** Valid-by-default user. Fresh object per call. */
export function buildUser(override?: Override<UserShape>): UserShape {
  return applyOverride(
    {
      id: testId("user"),
      email: "ada@example.test",
      displayName: "Ada Lovelace",
      createdAt: testTimestamp(),
    },
    override,
  );
}
