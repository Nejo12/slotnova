import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { listStableStories } from "./run-visual-regression.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const INDEX_JSON = join(here, "..", "storybook-static", "index.json");

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const stories = listStableStories(INDEX_JSON);

test.describe("stable Storybook system-state stories — visual regression", () => {
  for (const story of stories) {
    test(`${story.title} — Light`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story.lightId}&viewMode=story`);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${slug(story.title)}-light.png`, { fullPage: true });
    });

    test(`${story.title} — Dark`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story.darkId}&viewMode=story`);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${slug(story.title)}-dark.png`, { fullPage: true });
    });
  }
});
