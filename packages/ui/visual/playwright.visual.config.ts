import { defineConfig, devices } from "@playwright/test";

/**
 * Targeted visual regression (task T088): stable Storybook "System States/*"
 * stories only, Light + Dark, fixed viewport. Not the product E2E suite --
 * see apps/web/playwright.config.ts for that.
 */
export default defineConfig({
  testDir: "./",
  testMatch: "screenshots.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:6008",
    viewport: { width: 1024, height: 768 },
  },
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 },
  },
  webServer: {
    command: "pnpm exec http-server ../storybook-static -p 6008 --silent",
    url: "http://127.0.0.1:6008",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
