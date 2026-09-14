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
    // The real shell ("/") renders the shared "signed out" system state for
    // an isolated context with no session (T058/RequireSession) — it has
    // no sign-in form of its own (T058-T063 scope), so this asserts the
    // shell's own gating, not the harness.
    await expect(secondPage.getByText(/signed out/i)).toBeVisible();
    await expect(secondPage.getByTestId("signed-in-user")).toHaveCount(0);
  } finally {
    await isolated.close();
  }
});
