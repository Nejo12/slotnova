import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

/**
 * Shell accessibility E2E (T062): axe-clean shell navigation, keyboard
 * reachability with visible focus, against the real production shell in a
 * real browser — a browser-level complement to the jsdom-based axe/keyboard
 * unit tests in apps/web/src/app/shell/__tests__/.
 */
test.describe("Shell accessibility", () => {
  test("shell navigation, WorkspaceSwitcher and AccountMenu are axe-clean", async ({ page }) => {
    await signIn(page, "staff@example.test");
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("body").analyze();
    expect(results.violations).toEqual([]);
  });

  test("keyboard-only can reach every primary nav destination with visible focus", async ({
    page,
  }) => {
    await signIn(page, "staff@example.test");
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();

    const links = await nav.getByRole("link").all();
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      await link.focus();
      await expect(link).toBeFocused();
    }
  });
});
