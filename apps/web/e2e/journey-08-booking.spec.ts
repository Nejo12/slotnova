import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

/**
 * Phase-2 PR-08 Booking journey against the real API and real PostgreSQL.
 *
 * Deliberately entered from the Booking destination, NOT from a Calendar:
 * Calendar composition/UI is PR-09's, and nothing here builds or assumes
 * it. The journey proves the accepted create path end to end and the
 * destructive cancel path on the resulting confirmed booking.
 */

/**
 * A start time far enough ahead that repeated local runs never collide.
 * `dayOffset` keeps each test in this file on its own day, since the whole
 * file shares one database.
 */
function uniqueFutureStart(dayOffset: number): string {
  const start = new Date(Date.now() + 1000 * 60 * 60 * 24 * (30 + dayOffset));
  start.setSeconds(0, 0);
  start.setMinutes(0);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${String(start.getFullYear())}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` +
    `T${pad(start.getHours())}:${pad(start.getMinutes())}`
  );
}

/**
 * `owner@example.test` belongs to two workspaces, so sign-in leaves
 * `activeWorkspace` null until an explicit selection
 * (contracts/session.contract.md). Booking is workspace-scoped, so the
 * journey selects one through the real shell's own WorkspaceSwitcher
 * before touching any Booking surface.
 */
async function useAlphaWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  const switcher = page.getByRole("button", { name: /Workspace switcher/ });
  await switcher.click();
  await page.getByRole("menuitem", { name: "E2E Alpha Workspace" }).click();
  await expect(page.getByRole("button", { name: /Workspace switcher/ })).toContainText(
    "E2E Alpha Workspace",
  );
}

async function createBooking(page: Page, startsAt: string): Promise<void> {
  await page.goto("/bookings/new");

  await page.getByRole("radio", { name: /E2E Alpha Haircut/ }).check();
  await page.getByRole("button", { name: "Continue to time" }).click();

  await page.getByLabel(/Starts at/).fill(startsAt);
  await page.getByRole("button", { name: "Continue to review" }).click();

  await expect(page.getByRole("heading", { name: "Check your answers" })).toBeVisible();
  await expect(page.getByText("E2E Alpha Haircut")).toBeVisible();

  await page.getByRole("button", { name: "Confirm booking" }).click();
}

test("service -> time -> review -> confirm lands on a confirmed booking", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  const startsAt = uniqueFutureStart(0);
  await createBooking(page, startsAt);

  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  // Status is conveyed as a word, not by colour alone.
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  // Phase 2 has no client/customer dimension anywhere on this surface.
  // Scoped to the main landmark: "Clients" is a shell navigation
  // destination that PR-08 neither adds nor implements.
  await expect(page.getByRole("main").getByText(/client|customer/i)).toHaveCount(0);
});

test("a second booking in the same window is refused with an actionable overlap state", async ({
  page,
}) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  const startsAt = uniqueFutureStart(1);
  await createBooking(page, startsAt);
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  await createBooking(page, startsAt);

  await expect(page.getByText("That time is already booked")).toBeVisible();
  await page.getByRole("button", { name: "Choose another time" }).click();
  // The previously entered time is still there — nothing was discarded.
  await expect(page.getByLabel(/Starts at/)).toHaveValue(startsAt);
});

test("cancel requires a destructive confirmation and renders the cancelled state", async ({
  page,
}) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  const startsAt = uniqueFutureStart(2);
  await createBooking(page, startsAt);
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Cancel this booking?");
  await expect(dialog).toContainText("can't be undone");

  // The safe exit is visible and does not mutate anything.
  await dialog.getByRole("button", { name: "Keep booking" }).click();
  await expect(page.getByText("Confirmed").first()).toBeVisible();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();

  await expect(page.getByText("Booking cancelled")).toBeVisible();
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
});
