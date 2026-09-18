// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { http, HttpResponse } from "@slotnova/testing/msw";
import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  API_ORIGIN,
  COLOUR,
  HAIRCUT,
  bookingFixture,
  installDialogPolyfill,
  mockViewport,
  renderBooking,
} from "./test-support.js";

const here = dirname(fileURLToPath(import.meta.url));

const server = createMswServer();
setupMswServerLifecycle(server);

beforeAll(() => {
  installDialogPolyfill();
});

function seedHappyPath(): void {
  server.use(
    http.get(`${API_ORIGIN}/v1/catalog/services`, () =>
      HttpResponse.json({ items: [HAIRCUT, COLOUR], nextCursor: null }),
    ),
    http.get(`${API_ORIGIN}/v1/catalog/services/:id`, () => HttpResponse.json(HAIRCUT)),
    http.get(`${API_ORIGIN}/v1/bookings/:id`, () => HttpResponse.json(bookingFixture())),
    http.post(`${API_ORIGIN}/v1/bookings`, () =>
      HttpResponse.json(bookingFixture(), { status: 201 }),
    ),
    http.post(`${API_ORIGIN}/v1/bookings/:id/cancel`, () =>
      HttpResponse.json(bookingFixture({ status: "cancelled", version: 2 })),
    ),
    http.post(`${API_ORIGIN}/v1/bookings/:id/reschedule`, () =>
      HttpResponse.json(bookingFixture({ startsAt: "2026-10-01T13:00:00.000Z", version: 2 })),
    ),
  );
}

/** Zero CRITICAL violations is the gate; this run asserts zero of any severity. */
async function expectAxeClean(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  expect(results.violations.filter((violation) => violation.impact === "critical")).toHaveLength(0);
  expect(results.violations).toHaveLength(0);
}

describe("Booking accessibility", () => {
  beforeEach(() => {
    mockViewport(() => false);
    seedHappyPath();
  });

  afterEach(() => {
    cleanup();
  });

  it("is axe-clean on the service step", async () => {
    const { container } = renderBooking();
    await screen.findByRole("radio", { name: /Haircut/ });
    await expectAxeClean(container);
  });

  it("is axe-clean on the time and review steps, including a field error", async () => {
    const { container, user } = renderBooking();

    await user.click(await screen.findByRole("radio", { name: /Haircut/ }));
    await user.click(screen.getByRole("button", { name: "Continue to time" }));
    await screen.findByLabelText(/Starts at/);
    await expectAxeClean(container);

    // Submitting the empty required field surfaces an associated error.
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    const field = screen.getByLabelText(/Starts at/);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe("booking-starts-at-error");
    expect(document.activeElement).toBe(field);
    await expectAxeClean(container);

    await user.type(field, "2026-10-01T09:00");
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    await screen.findByRole("heading", { name: "Check your answers" });
    await expectAxeClean(container);
  });

  it("is axe-clean on booking detail and on the destructive confirmation", async () => {
    const { container, user } = renderBooking({ path: `/bookings/${bookingFixture().id}` });

    await screen.findByRole("heading", { name: "Details" });
    await expectAxeClean(container);

    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await screen.findByRole("dialog");
    await expectAxeClean(container);
  });

  it("completes the whole create flow with the keyboard only", async () => {
    const { user } = renderBooking();

    const haircut = await screen.findByRole("radio", { name: /Haircut/ });
    haircut.focus();
    await user.keyboard(" ");
    expect((haircut as HTMLInputElement).checked).toBe(true);

    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Continue to time");
    await user.keyboard("{Enter}");

    // Focus is moved to the new step's heading, not left on a dead control.
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Choose a start time"));

    const field = await screen.findByLabelText(/Starts at/);
    field.focus();
    await user.keyboard("2026-10-01T09:00");
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Continue to review");
    await user.keyboard("{Enter}");

    await screen.findByRole("heading", { name: "Check your answers" });
    const confirm = screen.getByRole("button", { name: "Confirm booking" });
    confirm.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Booking confirmed")).toBeDefined();
  });

  /**
   * PR-10 exit gap-closer. SC-009 names reschedule alongside create and
   * cancel, but the reschedule panel was the one changed interactive flow
   * with no axe run and no keyboard-only assertion of its own — it was
   * covered functionally (`booking-detail.test.tsx`) but not for
   * accessibility.
   */
  it("is axe-clean on the reschedule panel and operable with the keyboard only", async () => {
    const { container, user } = renderBooking({ path: `/bookings/${bookingFixture().id}` });

    const trigger = await screen.findByRole("button", { name: "Reschedule" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const field = await screen.findByLabelText(/New start time/);
    await expectAxeClean(container);

    // The field opens prefilled with the booking's current start time, so a
    // keyboard user can commit from here without retyping it.
    expect((field as HTMLInputElement).value).not.toBe("");
    field.focus();

    // Tab out of the field reaches the panel's own actions, in order, with
    // no trap: Back (safe exit) first, then the committing action.
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Back");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Save new time");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.queryByLabelText(/New start time/)).toBeNull());
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
  });

  it("associates a reschedule field error with its control and moves focus to it", async () => {
    const { container, user } = renderBooking({ path: `/bookings/${bookingFixture().id}` });

    await user.click(await screen.findByRole("button", { name: "Reschedule" }));
    const field = await screen.findByLabelText(/New start time/);
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save new time" }));

    await waitFor(() => expect(field.getAttribute("aria-invalid")).toBe("true"));
    expect(field.getAttribute("aria-describedby")).toBe("reschedule-starts-at-error");
    expect(document.activeElement).toBe(field);
    await expectAxeClean(container);
  });

  it("operates the destructive cancel confirmation with the keyboard only", async () => {
    const { user } = renderBooking({ path: `/bookings/${bookingFixture().id}` });

    const trigger = await screen.findByRole("button", { name: "Cancel booking" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    // Focus is inside the dialog, on the safe action for a destructive type.
    expect(document.activeElement?.closest("dialog")).toBe(dialog);

    const keep = screen.getByRole("button", { name: "Keep booking" });
    keep.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
  });
});

describe("Booking responsive/theming source guarantees", () => {
  const scss = readFileSync(resolve(here, "../booking.module.scss"), "utf8");

  it("substitutes a stacked mobile layout at <=400px rather than compressing the desktop grid", () => {
    expect(scss).toContain("@media (max-width: $mobile-max)");
    expect(scss).toContain("$mobile-max: 400px");

    const mobileBlock = scss.slice(scss.indexOf("@media (max-width: $mobile-max)"));
    // Summary pairs stack, actions become full-width stacked buttons.
    expect(mobileBlock).toMatch(/\.summary-list\s*\{[^}]*flex-direction:\s*column/);
    expect(mobileBlock).toMatch(/\.actions\s*\{[^}]*flex-direction:\s*column;/);
    // Only the step-footer variant reverses, so a destructive action is
    // never hoisted to the top of a stacked mobile action list.
    expect(mobileBlock).toMatch(/\.actions-end\s*\{[^}]*flex-direction:\s*column-reverse/);
    expect(mobileBlock).toMatch(/width:\s*100%/);
  });

  it("keeps every interactive row at the shared touch-target minimum", () => {
    expect(scss).toMatch(/min-height:\s*var\(--nova-control-touch-target\)/);
  });

  it("uses only semantic tokens for colour, and declares no motion of its own", () => {
    const colourDeclarations =
      scss.match(/(?:^|\s)(?:color|background|border-color):[^;]+;/g) ?? [];
    for (const declaration of colourDeclarations) {
      expect(declaration).toContain("var(--");
    }
    expect(scss).not.toMatch(/transition:|animation:/);
    expect(scss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("never positions a booking action with fixed/sticky placement over the mobile nav", () => {
    expect(scss).not.toMatch(/position:\s*(fixed|sticky)/);
  });
});

describe("Booking layout under a mobile viewport", () => {
  beforeEach(() => {
    mockViewport((query) => query.includes("max-width"));
    seedHappyPath();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the same semantics and action set at mobile width", async () => {
    const { container } = renderBooking({ path: `/bookings/${bookingFixture().id}` });

    await screen.findByRole("heading", { name: "Details" });
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeDefined();
    await expectAxeClean(container);
  });
});
