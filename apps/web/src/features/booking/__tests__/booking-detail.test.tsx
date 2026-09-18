// @vitest-environment jsdom
import { http, HttpResponse } from "@slotnova/testing/msw";
import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ALL_BOOKING_CAPABILITIES,
  API_ORIGIN,
  HAIRCUT,
  bookingFixture,
  installDialogPolyfill,
  mockViewport,
  problemBody,
  renderBooking,
} from "./test-support.js";
import type { Booking } from "../api/types.js";

const server = createMswServer();
setupMswServerLifecycle(server);

beforeAll(() => {
  installDialogPolyfill();
});

const DETAIL_PATH = `/bookings/${bookingFixture().id}`;

function detailRespondsWith(booking: Booking): void {
  server.use(http.get(`${API_ORIGIN}/v1/bookings/:id`, () => HttpResponse.json(booking)));
}

function serviceResolves(): void {
  server.use(http.get(`${API_ORIGIN}/v1/catalog/services/:id`, () => HttpResponse.json(HAIRCUT)));
}

function renderDetail(permissions: readonly string[] = ALL_BOOKING_CAPABILITIES) {
  return renderBooking({ path: DETAIL_PATH, permissions });
}

describe("Booking detail", () => {
  beforeEach(() => {
    mockViewport(() => false);
    serviceResolves();
    detailRespondsWith(bookingFixture());
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state while the booking is fetched", async () => {
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json(bookingFixture());
      }),
    );

    renderDetail();

    const busy = await screen.findByRole("status");
    expect(busy.textContent).toContain("Loading this booking");
  });

  it("renders a retryable error state when the booking cannot be loaded", async () => {
    let attempts = 0;
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json(problemBody("internal", 500), { status: 500 })
          : HttpResponse.json(bookingFixture());
      }),
    );

    const { user } = renderDetail();

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Details" })).toBeDefined();
  });

  it("renders a not-found state for a booking outside the active workspace", async () => {
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () =>
        HttpResponse.json(problemBody("not-found", 404), { status: 404 }),
      ),
    );

    renderDetail();
    expect(await screen.findByRole("heading", { name: /doesn't exist/i })).toBeDefined();
  });

  it("renders a 403 as a permission state", async () => {
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () =>
        HttpResponse.json(problemBody("forbidden", 403), { status: 403 }),
      ),
    );

    renderDetail();
    expect(await screen.findByRole("heading", { name: /can't view this booking/i })).toBeDefined();
  });

  it("conveys a confirmed booking's status as text, not colour alone", async () => {
    renderDetail();

    await screen.findByRole("heading", { name: "Details" });
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Haircut")).length).toBeGreaterThan(0);
  });

  it("renders a cancelled booking with no state-changing actions", async () => {
    detailRespondsWith(bookingFixture({ status: "cancelled", version: 2 }));
    renderDetail();

    await screen.findByRole("heading", { name: "Details" });
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark completed" })).toBeNull();
  });

  it("renders a completed booking with no state-changing actions", async () => {
    detailRespondsWith(bookingFixture({ status: "completed", version: 2 }));
    renderDetail();

    await screen.findByRole("heading", { name: "Details" });
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
  });

  it("does not render an action the authoritative capability state withholds", async () => {
    renderDetail(["booking:read", "catalog:read", "booking:edit"]);

    await screen.findByRole("heading", { name: "Details" });
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark completed" })).toBeNull();
  });

  it("shows no client, customer, staff, resource or location information", async () => {
    const { container } = renderDetail();
    await screen.findByRole("heading", { name: "Details" });
    expect(container.textContent).not.toMatch(/client|customer|staff|resource|location/i);
  });
});

describe("Reschedule", () => {
  beforeEach(() => {
    mockViewport(() => false);
    serviceResolves();
    detailRespondsWith(bookingFixture());
  });

  afterEach(() => {
    cleanup();
  });

  async function openReschedule(): Promise<ReturnType<typeof renderDetail>> {
    const rendered = renderDetail();
    await rendered.user.click(await screen.findByRole("button", { name: "Reschedule" }));
    await screen.findByLabelText(/New start time/);
    return rendered;
  }

  it("never offers a service change — the snapshot is preserved server-side", async () => {
    await openReschedule();

    const form = screen.getByRole("region", { name: "Reschedule this booking" });
    expect(form.querySelectorAll("input")).toHaveLength(1);
    expect(form.textContent).toContain("only the start time changes");
  });

  it("submits the current version and the new instant, then shows the new time", async () => {
    let received: Record<string, unknown> | null = null;
    const moved = bookingFixture({ startsAt: "2026-10-02T11:00:00.000Z", version: 2 });
    server.use(
      http.post(`${API_ORIGIN}/v1/bookings/:id/reschedule`, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(moved);
      }),
    );

    const { user } = await openReschedule();
    const field = screen.getByLabelText(/New start time/);
    await user.clear(field);
    await user.type(field, "2026-10-02T13:00");
    await user.click(screen.getByRole("button", { name: "Save new time" }));

    await waitFor(() => expect(received).not.toBeNull());
    expect(Object.keys(received ?? {}).sort()).toEqual(["startsAt", "version"]);
    expect((received as unknown as { version: number }).version).toBe(1);
    await waitFor(() => expect(screen.queryByLabelText(/New start time/)).toBeNull());
  });

  it("distinguishes booking-overlap from other failures", async () => {
    server.use(
      http.post(`${API_ORIGIN}/v1/bookings/:id/reschedule`, () =>
        HttpResponse.json(problemBody("booking-overlap", 409), { status: 409 }),
      ),
    );

    const { user } = await openReschedule();
    await user.click(screen.getByRole("button", { name: "Save new time" }));

    expect(await screen.findByText("That time is already booked")).toBeDefined();
    // The form stays open with the entered value, nothing is lost.
    expect(screen.getByLabelText(/New start time/)).toBeDefined();
  });

  it("surfaces stale-write as its own state and re-reads the booking instead of overwriting", async () => {
    let reads = 0;
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () => {
        reads += 1;
        return HttpResponse.json(bookingFixture({ version: reads === 1 ? 1 : 3 }));
      }),
      http.post(`${API_ORIGIN}/v1/bookings/:id/reschedule`, () =>
        HttpResponse.json(problemBody("stale-write", 409), { status: 409 }),
      ),
    );

    const { user } = await openReschedule();
    await user.click(screen.getByRole("button", { name: "Save new time" }));

    expect(await screen.findByText("This booking changed since you opened it")).toBeDefined();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
  });

  it("surfaces invalid-transition as an explicit state conflict", async () => {
    server.use(
      http.post(`${API_ORIGIN}/v1/bookings/:id/reschedule`, () =>
        HttpResponse.json(problemBody("invalid-transition", 409), { status: 409 }),
      ),
    );

    const { user } = await openReschedule();
    await user.click(screen.getByRole("button", { name: "Save new time" }));

    expect(await screen.findByText("This booking can no longer be rescheduled")).toBeDefined();
    await waitFor(() => expect(screen.queryByLabelText(/New start time/)).toBeNull());
  });
});

describe("Cancel", () => {
  beforeEach(() => {
    mockViewport(() => false);
    serviceResolves();
    detailRespondsWith(bookingFixture());
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a destructive confirmation naming the consequence and keeping a safe exit", async () => {
    const { user } = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Cancel this booking?");
    expect(dialog.textContent).toContain("will be cancelled and its time released");
    expect(dialog.textContent).toContain("can't be undone");
    expect(screen.getByRole("button", { name: "Keep booking" })).toBeDefined();
  });

  it("does not call the API when the safe exit is taken", async () => {
    let calls = 0;
    server.use(
      http.post(`${API_ORIGIN}/v1/bookings/:id/cancel`, () => {
        calls += 1;
        return HttpResponse.json(bookingFixture({ status: "cancelled", version: 2 }));
      }),
    );

    const { user } = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));
    await user.click(await screen.findByRole("button", { name: "Keep booking" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toBe(0);
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
  });

  it("confirms, calls the API with the current version, and renders the cancelled state", async () => {
    let received: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_ORIGIN}/v1/bookings/:id/cancel`, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(bookingFixture({ status: "cancelled", version: 2 }));
      }),
    );

    const { user } = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel booking",
    );
    confirm?.click();

    expect(await screen.findByText("Booking cancelled")).toBeDefined();
    expect(received).toEqual({ version: 1 });
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
  });
});

describe("Complete", () => {
  beforeEach(() => {
    mockViewport(() => false);
    serviceResolves();
    detailRespondsWith(bookingFixture());
  });

  afterEach(() => {
    cleanup();
  });

  it("marks a confirmed booking completed and renders the completed state", async () => {
    server.use(
      http.post(`${API_ORIGIN}/v1/bookings/:id/complete`, () =>
        HttpResponse.json(bookingFixture({ status: "completed", version: 2 })),
      ),
    );

    const { user } = renderDetail();
    await user.click(await screen.findByRole("button", { name: "Mark completed" }));

    expect(await screen.findByText("Booking completed")).toBeDefined();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });
});
