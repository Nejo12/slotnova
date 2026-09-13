import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Root fast-lane tests run before workspace packages are built. Resolve
    // local workspace imports directly to their source entry points so the
    // test runner never depends on stale/pre-existing dist output.
    alias: [
      {
        find: "@slotnova/db/testing",
        replacement: fileURLToPath(new URL("./packages/db/src/testing/index.ts", import.meta.url)),
      },
      {
        find: "@slotnova/db",
        replacement: fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      },
      {
        find: "@slotnova/observability-server",
        replacement: fileURLToPath(
          new URL("./packages/observability-server/src/index.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: [
      "tooling/**/__tests__/**/*.test.ts",
      "packages/**/__tests__/**/*.test.ts",
      "apps/**/__tests__/**/*.test.ts",
      "apps/**/__tests__/**/*.test.tsx",
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
