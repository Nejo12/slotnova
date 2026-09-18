// @vitest-environment jsdom
import { http, HttpResponse } from "@slotnova/testing/msw";
import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  API_ORIGIN,
  BOOKING_ID,
  READ_ONLY_CAPABILITIES,
  emptyView,
  mixedView,
  mockViewport,
  problemBody,
  renderCalendar,
} from "./test-support.js";
import type { CalendarView } from "../api/types.js";

const server = createMswServer();
setupMswServerLifecycle(server);

function calendarResolves(view: CalendarView = mixedView()): void {
  server.use(http.get(`${API_ORIGIN}/v1/calendar`, () => HttpResponse.json(view)));
}

/** Only critical violations fail the suite, matching the Booking surface's bar. */
async function criticalViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe(container);
  return results.violations.filter((v) => v.impact === "critical").map((v) => v.id);
}

describe("Calendar accessibility", () => {
  beforeEach(() => {
    mockViewport(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("has no critical axe violations with mixed content", async () => {
    calendarResolves();
    const { container } = renderCalendar();
    await screen.findByRole("list", { name: "Day timeline" });
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("has no critical axe violations in the mobile agenda", async () => {
    mockViewport(() => true);
    calendarResolves();
    const { container } = renderCalendar();
    await screen.findByRole("list", { name: "Day agenda" });
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("has no critical axe violations in the empty state", async () => {
    calendarResolves(emptyView());
    const { container } = renderCalendar();
    await screen.findByText("Nothing scheduled for this day");
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("has no critical axe violations in the error state", async () => {
    server.use(
      http.get(`${API_ORIGIN}/v1/calendar`, () =>
        HttpResponse.json(problemBody("internal", 500), {
          status: 500,
          headers: { "content-type": "application/problem+json" },
        }),
      ),
    );
    const { container } = renderCalendar();
    await screen.findByText("This calendar couldn't be loaded");
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("has no critical axe violations in the permission-restricted state", async () => {
    const { container } = renderCalendar({ permissions: ["booking:read"] });
    await screen.findByText("You can't view this calendar");
    expect(await criticalViolations(container)).toEqual([]);
  });

  it("uses a single h1 and a heading/landmark structure, with no fake ARIA grid", async () => {
    calendarResolves();
    const { container } = renderCalendar();
    await screen.findByRole("list", { name: "Day timeline" });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "Calendar day navigation" })).toBeTruthy();
    // A list of buttons, deliberately — not a grid whose keyboard model we
    // would then owe the user.
    expect(container.querySelector('[role="grid"]')).toBeNull();
    expect(container.querySelector('[role="gridcell"]')).toBeNull();
  });

  it("gives every entry a meaningful accessible name", async () => {
    calendarResolves();
    renderCalendar();
    await screen.findByRole("list", { name: "Day timeline" });

    for (const button of screen.getAllByRole("button")) {
      expect((button.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Calendar keyboard operation", () => {
  beforeEach(() => {
    mockViewport(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("reaches and activates date navigation with the keyboard alone", async () => {
    calendarResolves();
    const { user, currentPath } = renderCalendar({ path: "/calendar?day=2026-10-01" });
    await screen.findByRole("list", { name: "Day timeline" });

    const previous = screen.getByRole("button", { name: "Previous day" });
    previous.focus();
    expect(document.activeElement).toBe(previous);
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(currentPath()).toBe("/calendar?day=2026-09-30");
    });
  });

  it("tabs from the pager into the day's entries without a trap", async () => {
    calendarResolves();
    const { user } = renderCalendar({ path: "/calendar?day=2026-10-01" });
    await screen.findByRole("list", { name: "Day timeline" });

    const focusable = screen.getAllByRole("button");
    focusable[0]!.focus();
    for (let i = 1; i < focusable.length; i += 1) {
      await user.tab();
    }
    // Focus has moved forward through every control and landed on the last
    // one — nothing swallowed Tab along the way.
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it("opens an occupied booking with Enter from the keyboard", async () => {
    calendarResolves();
    const { user, currentPath } = renderCalendar();
    await screen.findByRole("list", { name: "Day timeline" });

    const entry = screen.getByRole("button", { name: /View booking/ });
    entry.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(currentPath()).toBe(`/bookings/${BOOKING_ID}`);
    });
  });

  it("keeps an unbookable open slot out of the tab order entirely", async () => {
    calendarResolves();
    renderCalendar({ permissions: READ_ONLY_CAPABILITIES });
    await screen.findByRole("list", { name: "Day timeline" });

    // Only the occupied entry is focusable; the inert open row is text.
    const entryButtons = screen
      .getAllByRole("button")
      .filter((button) => /View booking|New booking/.test(button.textContent ?? ""));
    expect(entryButtons).toHaveLength(1);
  });
});
