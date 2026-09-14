import { defineConfig } from "vitest/config";

/**
 * Real-PostgreSQL integration tests for `@slotnova/api`.
 *
 * Kept OUT of the root `pnpm test` (fast lane) because each file boots a
 * Testcontainers PostgreSQL instance. Run explicitly with
 * `pnpm --filter @slotnova/api test:integration` (heavy lane), which requires a
 * container runtime (Docker/Podman).
 *
 * `src/test/**` (no `__tests__` segment) is the cross-module isolation/
 * concurrency suite location `specs/001-platform-foundation-shell/tasks.md`
 * T040/T044 specify -- included alongside the ordinary per-module
 * `__tests__` convention.
 *
 * `*.contract.test.ts` (T067, under each module's `http/__tests__`
 * directory per the task's own file pattern) also boots the real app
 * against real PostgreSQL -- same heavy lane as `*.int.test.ts`, just named
 * to signal contract-catalogue validation rather than general integration
 * coverage.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.int.test.ts",
      "src/**/__tests__/**/*.contract.test.ts",
      "src/test/**/*.int.test.ts",
    ],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Containers are heavy; do not run integration files in parallel.
    fileParallelism: false,
    pool: "forks",
  },
});
