import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: { SLOTNOVA_ENV: "preview" },
    setupFiles: ["../../packages/testing/src/msw/deny-network.setup.ts"],
    environment: "node",
    include: ["src/**/__tests__/**/*.int.test.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
    pool: "forks",
  },
});
