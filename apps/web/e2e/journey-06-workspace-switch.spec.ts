import { expect, test } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

test("journey 6: workspace switch clears prior-workspace foundation data", async ({
  context,
  page,
}) => {
  await signIn(page, "owner@example.test");
  await page.getByRole("button", { name: "Use E2E Alpha Workspace" }).click();
  await expect(page.getByTestId("active-workspace")).toContainText("E2E Alpha Workspace");
  await expect(page.getByTestId("foundation-membership")).toHaveText(
    "Membership record: E2E Alpha Workspace / owner",
  );
  const before = (await context.cookies()).find((cookie) => cookie.name === "slotnova_session");

  await page.getByRole("button", { name: "Use E2E Beta Workspace" }).click();
  await expect(page.getByTestId("active-workspace")).toContainText("E2E Beta Workspace");
  await expect(page.getByTestId("foundation-membership")).toHaveText(
    "Membership record: E2E Beta Workspace / owner",
  );
  await expect(page.getByTestId("foundation-membership")).not.toContainText("E2E Alpha Workspace");
  const after = (await context.cookies()).find((cookie) => cookie.name === "slotnova_session");
  expect(before?.value).toBeTruthy();
  expect(after?.value).toBeTruthy();
  expect(after?.value).not.toBe(before?.value);
});
