import { defineConfig } from "vitest/config";

export default defineConfig({
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
