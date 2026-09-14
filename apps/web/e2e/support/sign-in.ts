import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("test-harness")).toBeVisible();
  await page.getByLabel("Seeded user email").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("signed-in-user")).toContainText(email);
}
