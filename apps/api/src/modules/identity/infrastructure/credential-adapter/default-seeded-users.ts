/**
 * The default seeded-user allowlist for local development (T035). Tests build
 * their own seeded users via `packages/testing` builders instead of depending
 * on this list, so it stays free of a runtime dependency on a test package;
 * this is only the convenience default for `pnpm dev:api` against a freshly
 * seeded local database.
 */
import type { SeededDevUser } from "./dev-adapter.js";

export const DEFAULT_SEEDED_USERS: readonly SeededDevUser[] = [
  { email: "owner@example.test", displayName: "Dev Owner" },
  { email: "staff@example.test", displayName: "Dev Staff" },
  { email: "disabled@example.test", displayName: "Dev Disabled User" },
];
