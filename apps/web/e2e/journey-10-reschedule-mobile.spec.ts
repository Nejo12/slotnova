import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

/**
 * Phase-2 PR-10 exit-validation journey. It exists only to close the two
 * integrated-evidence gaps the PR-10 evidence matrix found; it deliberately
 * re-proves nothing journey-08 (Booking create / overlap / cancel) or
 * journey-09 (Calendar composition and its two navigations) already prove:
 *
 * 1. **Reschedule** had no integrated real-API/real-PostgreSQL journey.
 *    It was proven at the API layer (`booking-api.int.test.ts`) and at the
 *    component layer against MSW (`booking-detail.test.tsx`), but never
 *    end-to-end through the real browser.
 * 2. **A representative <=400px mobile path in a real browser.** SC-008's
 *    mobile half was proven only in jsdom (`calendar-states.test.tsx`,
 *    `booking-a11y.test.tsx`), which cannot evaluate real CSS, so "the fixed
 *    mobile nav never covers a primary action" was asserted from stylesheet
 *    text rather than from laid-out geometry.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * Its own day per `dayOffset`, far enough ahead that repeated local runs
 * never collide, and disjoint from journey-08's (+30d) and journey-09's
 * (+60d) windows since the whole suite shares one database.
 */
function uniqueFutureStart(dayOffset: number, hour = 9): { local: string; day: string } {
  const start = new Date(Date.now() + 1000 * 60 * 60 * 24 * (90 + dayOffset));
  start.setHours(hour, 0, 0, 0);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${String(start.getFullYear())}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  return { local: `${day}T${pad(start.getHours())}:${pad(start.getMinutes())}`, day };
}

/**
 * `owner@example.test` belongs to two workspaces, so sign-in leaves
 * `activeWorkspace` null until an explicit selection. The switcher is a
 * desktop-shell control (the mobile top bar shows the workspace name only),
 * so the mobile test selects the workspace at desktop width first and then
 * resizes — the selection is session state on the server, not a layout
 * concern.
 */
async function useAlphaWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /Workspace switcher/ }).click();
  await page.getByRole("menuitem", { name: "E2E Alpha Workspace" }).click();
  await expect(page.getByRole("button", { name: /Workspace switcher/ })).toContainText(
    "E2E Alpha Workspace",
  );
}

async function createBooking(page: Page, startsAtLocal: string): Promise<void> {
  await page.goto("/bookings/new");
  await page.getByRole("radio", { name: /E2E Alpha Haircut/ }).check();
  await page.getByRole("button", { name: "Continue to time" }).click();
  await page.getByLabel(/Starts at/).fill(startsAtLocal);
  await page.getByRole("button", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
}

/**
 * The rendered "Starts at" value, addressed through its own `<dt>` so the
 * assertion never hard-codes an `Intl` locale format or a class name.
 */
function startsAtValue(page: Page) {
  return page.locator('dt:text-is("Starts at") + dd');
}

test("reschedule moves a confirmed booking to a new time end to end", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  const original = uniqueFutureStart(0, 9);
  const moved = uniqueFutureStart(0, 15);
  await createBooking(page, original.local);
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  const before = await startsAtValue(page).textContent();

  await page.getByRole("button", { name: "Reschedule" }).click();
  const form = page.getByRole("region", { name: "Reschedule this booking" });
  await expect(form).toBeVisible();
  // Reschedule changes the time and nothing else: the Service snapshot is
  // preserved server-side, so no Service control is offered.
  await expect(form.getByRole("radio")).toHaveCount(0);

  await form.getByLabel(/New start time/).fill(moved.local);
  await form.getByRole("button", { name: "Save new time" }).click();

  // The form closes, the booking stays confirmed, and the rendered start
  // time actually changed — read back from the server, not from local state.
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(startsAtValue(page)).not.toHaveText(before ?? "");

  await page.reload();
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(startsAtValue(page)).not.toHaveText(before ?? "");

  // The vacated 09:00 window is free again: the same time now books cleanly
  // where a live conflict would have produced `booking-overlap`.
  await createBooking(page, original.local);
  await expect(page.getByText("Booking confirmed")).toBeVisible();
});

test("Booking and Calendar are operable at a 390px mobile viewport", async ({ page }) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  const slot = uniqueFutureStart(1, 11);
  await createBooking(page, slot.local);
  const bookingUrl = page.url();

  await page.setViewportSize(MOBILE_VIEWPORT);

  // The mobile shell is a deliberate substitution, and its five-item primary
  // bar is the hard product invariant — Booking is NOT promoted into it.
  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNav.getByRole("link")).toHaveText([
    "Home",
    "Calendar",
    "Clients",
    "Recovery",
  ]);
  await expect(primaryNav.getByRole("button", { name: "More destinations" })).toBeVisible();

  await page.goto(`/calendar?day=${slot.day}`);

  // A stacked agenda, not a compressed desktop timeline.
  await expect(page.locator('[data-layout="mobile"]')).toBeVisible();
  await expect(page.locator('[data-layout="desktop"]')).toHaveCount(0);

  const agenda = page.getByRole("list", { name: /Day agenda/ });
  await expect(agenda.getByText("Open").first()).toBeVisible();
  await expect(agenda.getByText("Booked").first()).toBeVisible();
  // A deliberate mobile layout does not scroll sideways.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);

  await agenda
    .getByRole("button", { name: /View booking/ })
    .first()
    .click();
  await expect(page).toHaveURL(bookingUrl);

  // The fixed bottom nav reserves its own height, so the last primary action
  // is laid out clear of it. Asserted from real geometry, which is exactly
  // what the jsdom stylesheet assertions cannot do.
  const cancel = page.getByRole("button", { name: "Cancel booking" });
  await cancel.scrollIntoViewIfNeeded();
  const action = await cancel.boundingBox();
  const nav = await primaryNav.boundingBox();
  expect(action).not.toBeNull();
  expect(nav).not.toBeNull();
  expect((action?.y ?? 0) + (action?.height ?? 0)).toBeLessThanOrEqual(nav?.y ?? 0);
});
