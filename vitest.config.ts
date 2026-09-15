import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Root fast-lane tests run before workspace packages are built. Resolve
    // local workspace imports directly to their source entry points so the
    // test runner never depends on stale/pre-existing dist output.
    alias: [
      {
        find: "@slotnova/deployment-config",
        replacement: fileURLToPath(
          new URL("./packages/deployment-config/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@slotnova/contracts/msw",
        replacement: fileURLToPath(
          new URL("./packages/contracts/src/msw/index.ts", import.meta.url),
        ),
      },
      {
        find: "@slotnova/contracts",
        replacement: fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
      },
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
      {
        find: "@slotnova/testing/builders",
        replacement: fileURLToPath(
          new URL("./packages/testing/src/builders/index.ts", import.meta.url),
        ),
      },
      {
        find: "@slotnova/testing",
        replacement: fileURLToPath(new URL("./packages/testing/src/index.ts", import.meta.url)),
      },
      {
        find: "@slotnova/design-tokens",
        replacement: fileURLToPath(
          new URL("./packages/design-tokens/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@slotnova/ui",
        replacement: fileURLToPath(new URL("./packages/ui/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    env: { SLOTNOVA_ENV: "preview" },
    environment: "node",
    include: [
      "tooling/**/__tests__/**/*.test.ts",
      "packages/**/__tests__/**/*.test.ts",
      "packages/**/__tests__/**/*.test.tsx",
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
      // T067 contract tests (`*.contract.test.ts`) boot the real app against
      // real PostgreSQL, same as `*.int.test.ts` -- heavy lane only.
      "**/*.contract.test.ts",
    ],
  },
});
