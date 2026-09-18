import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

/**
 * Phase-2 PR-09 Calendar journey against the real API and real PostgreSQL.
 *
 * Bounded on purpose: Calendar -> sees an open interval AND an occupied
 * booking in the same day -> opens the occupied booking's detail -> returns
 * to the Calendar -> starts a new booking from open Calendar context. It
 * does NOT re-prove PR-08's create/cancel flow (journey-08 owns that), and
 * it touches no Clients, Recovery or Payments surface — none of which
 * exists.
 *
 * The composed payload is real: Scheduling's resolved availability comes
 * from the seeded Alpha availability pattern, and the occupancy comes from a
 * booking this journey creates through the real API.
 */

/**
 * A start time far enough ahead that repeated local runs never collide, on
 * its own day per `dayOffset` since the whole file shares one database.
 * Returned as both the `datetime-local` value the create flow takes and the
 * `YYYY-MM-DD` key the Calendar's `?day=` parameter takes — the same LOCAL
 * day, so the calendar window and the booking cannot drift apart.
 */
function uniqueFutureStart(dayOffset: number): { local: string; day: string } {
  const start = new Date(Date.now() + 1000 * 60 * 60 * 24 * (60 + dayOffset));
  start.setHours(11, 0, 0, 0);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${String(start.getFullYear())}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  return { local: `${day}T${pad(start.getHours())}:${pad(start.getMinutes())}`, day };
}

/**
 * `owner@example.test` belongs to two workspaces, so sign-in leaves
 * `activeWorkspace` null until an explicit selection. Calendar is
 * workspace-scoped, so the journey selects one through the real shell's own
 * WorkspaceSwitcher before touching it.
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

test("calendar shows open time and an occupied booking, and navigates into both Booking surfaces", async ({
  page,
}) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  const slot = uniqueFutureStart(0);
  await createBooking(page, slot.local);
  const bookingUrl = page.url();

  await page.goto(`/calendar?day=${slot.day}`);

  // The composed day: Scheduling's open interval AND Booking's occupancy,
  // each labelled in words rather than by colour.
  const timeline = page.getByRole("list", { name: /Day timeline|Day agenda/ });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText("Open").first()).toBeVisible();
  await expect(timeline.getByText("Booked").first()).toBeVisible();

  // Occupied entry -> that booking's detail (PR-08's surface, not a copy).
  await timeline
    .getByRole("button", { name: /View booking/ })
    .first()
    .click();
  await expect(page).toHaveURL(bookingUrl);
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();

  // Back to the Calendar, on the same day.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?day=${slot.day}$`));

  // Open time -> PR-08's create flow, carrying the start instant in the URL
  // and nothing else. No booking exists yet at this point.
  await page
    .getByRole("button", { name: /New booking/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/bookings\/new\?startsAt=/);
  await expect(page.getByRole("heading", { name: /Choose a service/i })).toBeVisible();
});

test("calendar date navigation moves one bounded day at a time and returns to today", async ({
  page,
}) => {
  await signIn(page, "owner@example.test");
  await useAlphaWorkspace(page);

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/\/calendar\?day=\d{4}-\d{2}-\d{2}$/);
  const forward = new URL(page.url()).searchParams.get("day");

  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Previous day" }).click();
  const back = new URL(page.url()).searchParams.get("day");
  expect(back).not.toBe(forward);

  await page.getByRole("button", { name: "Go to today" }).click();
  await expect(page.getByRole("button", { name: "Go to today" })).toBeDisabled();
});

test("a workspace without the scheduling capability sees a permission state, not an empty calendar", async ({
  page,
}) => {
  // `staff@example.test` belongs to the restricted workspace only, so it is
  // already active after sign-in — no switcher step, and the membership
  // carries an empty permission set.
  await signIn(page, "staff@example.test");

  await page.goto("/calendar");

  await expect(page.getByText("You can't view this calendar")).toBeVisible();
  // Distinct from empty, and distinct from a generic failure.
  await expect(page.getByText("Nothing scheduled for this day")).toHaveCount(0);
  await expect(page.getByText("This calendar couldn't be loaded")).toHaveCount(0);

  // The client-side gate is an affordance; the SERVER is the boundary. The
  // same authenticated session is refused by the API itself.
  const response = await page.request.get(
    "http://127.0.0.1:3001/v1/calendar?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z",
  );
  expect(response.status()).toBe(403);
  const problem = (await response.json()) as { type: string; requiredCapability: string };
  expect(problem.type).toContain("/problems/forbidden");
  expect(["booking:read", "scheduling:read"]).toContain(problem.requiredCapability);
});
