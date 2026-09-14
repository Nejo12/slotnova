import { expect, type Page } from "@playwright/test";

/**
 * Establishes a session via the VITE_E2E-gated dev credential adapter at
 * /__test-harness — used ONLY to sign in (T063). Callers must navigate
 * away to the real shell ("/") before exercising or asserting against any
 * shell behavior; no journey assertion runs against the harness itself.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/__test-harness");
  await expect(page.getByTestId("test-harness")).toBeVisible();
  await page.getByLabel("Seeded user email").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("signed-in-user")).toContainText(email);
}
