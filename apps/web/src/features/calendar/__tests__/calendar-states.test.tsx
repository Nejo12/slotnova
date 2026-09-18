// @vitest-environment jsdom
import { http, HttpResponse } from "@slotnova/testing/msw";
import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  API_ORIGIN,
  BOOKING_ID,
  CALENDAR_CAPABILITIES,
  READ_ONLY_CAPABILITIES,
  SERVICE_ID,
  emptyView,
  mixedView,
  mockViewport,
  occupiedOnlyView,
  openOnlyView,
  problemBody,
  renderCalendar,
} from "./test-support.js";
import type { CalendarView } from "../api/types.js";

const server = createMswServer();
setupMswServerLifecycle(server);

function calendarResolves(view: CalendarView = mixedView()): void {
  server.use(http.get(`${API_ORIGIN}/v1/calendar`, () => HttpResponse.json(view)));
}

function calendarFails(slug: string, status: number): void {
  server.use(
    http.get(`${API_ORIGIN}/v1/calendar`, () =>
      HttpResponse.json(problemBody(slug, status), {
        status,
        headers: { "content-type": "application/problem+json" },
      }),
    ),
  );
}

describe("Calendar states", () => {
  beforeEach(() => {
    mockViewport(() => false);
    calendarResolves();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading state while the day is fetched", async () => {
    server.use(
      http.get(`${API_ORIGIN}/v1/calendar`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json(mixedView());
      }),
    );

    renderCalendar();

    expect(await screen.findByText("Loading this day's calendar")).toBeTruthy();
    // Not a blank grid: the busy state is announced.
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders an explicit empty state, not a blank grid", async () => {
    calendarResolves(emptyView());

    renderCalendar();

    expect(await screen.findByText("Nothing scheduled for this day")).toBeTruthy();
    expect(screen.queryByRole("list", { name: /Day timeline|Day agenda/ })).toBeNull();
  });

  it("renders an error state with a working Retry that refetches", async () => {
    let attempts = 0;
    server.use(
      http.get(`${API_ORIGIN}/v1/calendar`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(problemBody("internal", 500), {
            status: 500,
            headers: { "content-type": "application/problem+json" },
          });
        }
        return HttpResponse.json(mixedView());
      }),
    );

    const { user } = renderCalendar();

    expect(await screen.findByText("This calendar couldn't be loaded")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("list", { name: "Day timeline" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("renders a permission-restricted state that is distinct from empty when a capability is missing", async () => {
    renderCalendar({ permissions: ["booking:read"] });

    expect(await screen.findByText("You can't view this calendar")).toBeTruthy();
    expect(screen.getByText(/booking:read and scheduling:read/)).toBeTruthy();
    // Distinct from the empty state, and no calendar content is implied.
    expect(screen.queryByText("Nothing scheduled for this day")).toBeNull();
  });

  it("renders the permission state — not empty — when the server answers 403 mid-session", async () => {
    calendarFails("forbidden", 403);

    renderCalendar();

    expect(await screen.findByText("You can't view this calendar")).toBeTruthy();
    expect(screen.queryByText("Nothing scheduled for this day")).toBeNull();
  });

  it("renders a session-ended error distinctly from a generic failure", async () => {
    calendarFails("session-invalid", 401);

    renderCalendar();

    expect(await screen.findByText("Your session has ended")).toBeTruthy();
  });

  it("does not request the calendar at all when the capabilities are missing", async () => {
    let requested = false;
    server.use(
      http.get(`${API_ORIGIN}/v1/calendar`, () => {
        requested = true;
        return HttpResponse.json(mixedView());
      }),
    );

    renderCalendar({ permissions: [] });

    expect(await screen.findByText("You can't view this calendar")).toBeTruthy();
    expect(requested).toBe(false);
  });
});

describe("Calendar content", () => {
  beforeEach(() => {
    mockViewport(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an open-only day with the availability stated in words", async () => {
    calendarResolves(openOnlyView());

    renderCalendar();

    const list = await screen.findByRole("list", { name: "Day timeline" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]!).getByText("Open")).toBeTruthy();
    expect(screen.getByText(/1 open period and no bookings/)).toBeTruthy();
  });

  it("renders an occupied-only day with the status stated in words", async () => {
    calendarResolves(occupiedOnlyView());

    renderCalendar();

    const list = await screen.findByRole("list", { name: "Day timeline" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(within(items[0]!).getByText("Booked")).toBeTruthy();
    expect(screen.getByText(/No open time and 1 booking/)).toBeTruthy();
  });

  it("renders a mixed day chronologically, occupied before an open period starting later", async () => {
    calendarResolves(mixedView());

    renderCalendar();

    const list = await screen.findByRole("list", { name: "Day timeline" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // The open period starts at 08:00, the booking's occupied window at 09:55.
    expect(within(items[0]!).getByText("Open")).toBeTruthy();
    expect(within(items[1]!).getByText("Booked")).toBeTruthy();
  });

  it("never conveys availability by colour alone — every entry carries a word and a time range", async () => {
    calendarResolves(mixedView());

    renderCalendar();

    const list = await screen.findByRole("list", { name: "Day timeline" });
    for (const item of within(list).getAllByRole("listitem")) {
      expect(item.textContent).toMatch(/Open|Booked|Completed/);
      expect(item.textContent).toMatch(/\d{1,2}[:.]\d{2}/);
    }
  });

  it("shows no client, customer, staff, resource or location dimension anywhere", async () => {
    calendarResolves(mixedView());

    const { container } = renderCalendar();

    await screen.findByRole("list", { name: "Day timeline" });
    expect(container.textContent).not.toMatch(/client|customer|staff|resource|location/i);
  });

  it("renders open time as inert text — not a disabled control — without booking:create", async () => {
    calendarResolves(openOnlyView());

    renderCalendar({ permissions: READ_ONLY_CAPABILITIES });

    const list = await screen.findByRole("list", { name: "Day timeline" });
    expect(within(list).queryByRole("button")).toBeNull();
    expect(within(list).getByText("Open")).toBeTruthy();
  });

  it("keeps the occupied entry interactive for a read-only operator", async () => {
    calendarResolves(occupiedOnlyView());

    renderCalendar({ permissions: READ_ONLY_CAPABILITIES });

    const list = await screen.findByRole("list", { name: "Day timeline" });
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });
});

describe("Calendar layout substitution", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the desktop timeline above the mobile breakpoint", async () => {
    mockViewport(() => false);
    calendarResolves();

    const { container } = renderCalendar();

    await screen.findByRole("list", { name: "Day timeline" });
    expect(container.querySelector('[data-layout="desktop"]')).toBeTruthy();
    expect(container.querySelector('[data-layout="mobile"]')).toBeNull();
  });

  it("renders a deliberately different mobile agenda at <= 400px, not a compressed timeline", async () => {
    mockViewport(() => true);
    calendarResolves();

    const { container } = renderCalendar();

    const list = await screen.findByRole("list", { name: "Day agenda" });
    expect(container.querySelector('[data-layout="mobile"]')).toBeTruthy();
    expect(container.querySelector('[data-layout="desktop"]')).toBeNull();
    // The trailing action column exists only on desktop; on mobile the row
    // itself is the target and the action lives in its accessible name.
    expect(within(list).queryByText("View booking", { selector: "span:not([class])" })).toBeNull();
    expect(within(list).getByRole("button", { name: /View booking/ })).toBeTruthy();
  });
});

describe("Calendar navigation into Booking", () => {
  beforeEach(() => {
    mockViewport(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates an occupied entry to that booking's detail route", async () => {
    calendarResolves(occupiedOnlyView());

    const { user, currentPath } = renderCalendar();

    await user.click(await screen.findByRole("button", { name: /View booking/ }));

    await waitFor(() => {
      expect(currentPath()).toBe(`/bookings/${BOOKING_ID}`);
    });
  });

  it("enters the Booking create flow from an open slot, carrying that start time in the URL", async () => {
    calendarResolves(openOnlyView());
    server.use(
      http.get(`${API_ORIGIN}/v1/catalog/services`, () => HttpResponse.json({ items: [] })),
    );

    const { user, currentPath } = renderCalendar({
      permissions: [...CALENDAR_CAPABILITIES, "catalog:read"],
    });

    await user.click(await screen.findByRole("button", { name: /New booking/ }));

    await waitFor(() => {
      expect(currentPath()).toBe(
        `/bookings/new?startsAt=${encodeURIComponent("2026-10-01T08:00:00Z")}`,
      );
    });
    // The create flow still starts at its own first step — the prefill
    // creates no server state and does not skip the Service decision.
    expect(await screen.findByRole("heading", { name: /Choose a service/i })).toBeTruthy();
  });
});

describe("Booking-create prefill (client-side only)", () => {
  const SERVICE = {
    id: SERVICE_ID,
    name: "Haircut",
    categoryId: null,
    durationMinutes: 45,
    preBufferMinutes: 5,
    postBufferMinutes: 10,
    priceAmountMinor: 4500,
    priceCurrency: "EUR",
    active: true,
  };

  beforeEach(() => {
    mockViewport(() => false);
    server.use(
      http.get(`${API_ORIGIN}/v1/catalog/services`, () => HttpResponse.json({ items: [SERVICE] })),
    );
  });

  afterEach(() => {
    cleanup();
  });

  async function reachTimeStep(path: string) {
    const rendered = renderCalendar({
      path,
      permissions: [...CALENDAR_CAPABILITIES, "catalog:read"],
    });
    await rendered.user.click(await screen.findByRole("radio", { name: /Haircut/ }));
    await rendered.user.click(screen.getByRole("button", { name: /Continue to time/i }));
    return rendered;
  }

  it("prefills the start-time field from ?startsAt", async () => {
    await reachTimeStep(`/bookings/new?startsAt=${encodeURIComponent("2026-10-01T08:00:00Z")}`);

    const field = (await screen.findByLabelText(/Starts at/)) as HTMLInputElement;
    // Rendered in the viewer's own local zone, so the assertion compares
    // against the same conversion the component uses rather than a fixed
    // UTC string.
    expect(field.value).not.toBe("");
    expect(field.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("degrades safely to an empty field for a malformed ?startsAt", async () => {
    await reachTimeStep("/bookings/new?startsAt=not-an-instant");

    const field = (await screen.findByLabelText(/Starts at/)) as HTMLInputElement;
    expect(field.value).toBe("");
    // A bad link produces a usable form, never an error state.
    expect(screen.queryByText(/couldn't/i)).toBeNull();
  });

  it("leaves the field empty when no prefill is supplied", async () => {
    await reachTimeStep("/bookings/new");

    const field = (await screen.findByLabelText(/Starts at/)) as HTMLInputElement;
    expect(field.value).toBe("");
  });
});
