import { expect, test } from "@playwright/test";

import { secondContext } from "./support/browser.js";
import { signIn } from "./support/sign-in.js";

test("test harness loads and signs in through the dev adapter", async ({ browser, page }) => {
  await signIn(page, "staff@example.test");
  await expect(page.getByTestId("active-workspace")).toContainText("E2E Restricted Workspace");

  const isolated = await secondContext(browser);
  try {
    const secondPage = await isolated.newPage();
    await secondPage.goto("/");
    await expect(secondPage.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(secondPage.getByTestId("signed-in-user")).toHaveCount(0);
  } finally {
    await isolated.close();
  }
});
