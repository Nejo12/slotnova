import { expect, test } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

test("journey 7: restricted user is denied invitations server-side", async ({ page }) => {
  await signIn(page, "staff@example.test");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/v1/invitations") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Issue invitation" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(403);

  const problem = (await response.json()) as { type: string; requiredCapability: string };
  expect(problem.type).toContain("/problems/forbidden");
  expect(problem.requiredCapability).toBe("members:invite");
  await expect(page.getByTestId("action-status")).toHaveText("HTTP 403");
  await expect(page.getByTestId("problem-response")).toContainText(
    '"requiredCapability":"members:invite"',
  );
});
