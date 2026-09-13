import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The fast lane runs tests before workspace package builds. Resolve local
    // workspace packages through their explicit `source` export condition so
    // clean CI does not depend on stale/pre-existing dist output.
    conditions: ["source"],
  },
  test: {
    environment: "node",
    include: [
      "tooling/**/__tests__/**/*.test.ts",
      "packages/**/__tests__/**/*.test.ts",
      "apps/**/__tests__/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/__fixtures__/**",
      // Real-PostgreSQL integration tests run in the heavy lane via each
      // package's own `test:integration` script, not in `pnpm test`.
      "**/*.int.test.ts",
    ],
  },
});
