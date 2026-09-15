import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: [
    {
      command: "pnpm e2e:server",
      cwd: "../..",
      url: "http://127.0.0.1:3001/healthz",
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        SLOTNOVA_ENV: "preview",
        VITE_E2E: "true",
        VITE_API_URL: "http://127.0.0.1:3001",
      },
    },
  ],
});
