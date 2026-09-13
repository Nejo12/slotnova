import { defineConfig } from "vitest/config";

/**
 * Real-PostgreSQL integration tests for `@slotnova/api`.
 *
 * Kept OUT of the root `pnpm test` (fast lane) because each file boots a
 * Testcontainers PostgreSQL instance. Run explicitly with
 * `pnpm --filter @slotnova/api test:integration` (heavy lane), which requires a
 * container runtime (Docker/Podman).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.int.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Containers are heavy; do not run integration files in parallel.
    fileParallelism: false,
    pool: "forks",
  },
});
