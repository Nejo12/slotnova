// @vitest-environment jsdom
import { http, HttpResponse } from "@slotnova/testing/msw";
import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  API_ORIGIN,
  COLOUR,
  HAIRCUT,
  RETIRED,
  bookingFixture,
  mockViewport,
  problemBody,
  renderBooking,
} from "./test-support.js";

const server = createMswServer();
setupMswServerLifecycle(server);

interface CapturedCreate {
  idempotencyKey: string | null;
  body: Record<string, unknown>;
}

const created: CapturedCreate[] = [];

function servicesRespond(items: readonly unknown[]): void {
  server.use(
    http.get(`${API_ORIGIN}/v1/catalog/services`, () =>
      HttpResponse.json({ items, nextCursor: null }),
    ),
  );
}

function servicesFail(status: number, slug: string): void {
  server.use(
    http.get(`${API_ORIGIN}/v1/catalog/services`, () =>
      HttpResponse.json(problemBody(slug, status), { status }),
    ),
  );
}

/** Records every create attempt, then answers with `respond(attemptIndex)`. */
function captureCreate(respond: (attempt: number) => Response): void {
  server.use(
    http.post(`${API_ORIGIN}/v1/bookings`, async ({ request }) => {
      created.push({
        idempotencyKey: request.headers.get("idempotency-key"),
        body: (await request.json()) as Record<string, unknown>,
      });
      return respond(created.length - 1);
    }),
  );
}

async function chooseHaircutThenTime(
  user: ReturnType<typeof renderBooking>["user"],
): Promise<void> {
  await user.click(await screen.findByRole("radio", { name: /Haircut/ }));
  await user.click(screen.getByRole("button", { name: "Continue to time" }));
  await user.type(await screen.findByLabelText(/Starts at/), "2026-10-01T09:00");
  await user.click(screen.getByRole("button", { name: "Continue to review" }));
  await screen.findByRole("heading", { name: "Check your answers" });
}

describe("Booking create flow", () => {
  beforeEach(() => {
    created.length = 0;
    mockViewport(() => false);
    servicesRespond([HAIRCUT, COLOUR]);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state while services are being fetched", async () => {
    server.use(
      http.get(`${API_ORIGIN}/v1/catalog/services`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return HttpResponse.json({ items: [HAIRCUT], nextCursor: null });
      }),
    );

    renderBooking();

    // The shared loading presentation exposes role="status"/aria-busy with
    // a visually-hidden label, so the busy state is announced as text.
    const busy = await screen.findByRole("status");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.textContent).toContain("Loading services");
    expect(await screen.findByRole("radio", { name: /Haircut/ })).toBeDefined();
  });

  it("renders an error state with a retry that re-requests services", async () => {
    let attempts = 0;
    server.use(
      http.get(`${API_ORIGIN}/v1/catalog/services`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json(problemBody("internal", 500), { status: 500 })
          : HttpResponse.json({ items: [HAIRCUT], nextCursor: null });
      }),
    );

    const { user } = renderBooking();

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radio", { name: /Haircut/ })).toBeDefined();
  });

  it("renders an empty state when the workspace has no active services", async () => {
    servicesRespond([]);
    renderBooking();

    expect(await screen.findByRole("heading", { name: /No active services yet/ })).toBeDefined();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("never offers an inactive service as a selectable option", async () => {
    servicesRespond([HAIRCUT, RETIRED]);
    renderBooking();

    await screen.findByRole("radio", { name: /Haircut/ });
    expect(screen.queryByRole("radio", { name: /Retired service/ })).toBeNull();
  });

  it("walks Service -> time -> Review -> confirmed booking detail", async () => {
    captureCreate(() => HttpResponse.json(bookingFixture(), { status: 201 }));
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () => HttpResponse.json(bookingFixture())),
      http.get(`${API_ORIGIN}/v1/catalog/services/:id`, () => HttpResponse.json(HAIRCUT)),
    );

    const { user } = renderBooking();
    await chooseHaircutThenTime(user);

    const review = screen.getByRole("region", { name: "Check your answers" });
    expect(within(review).getByText("Haircut")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText("Booking confirmed")).toBeDefined();
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    // The create request carried exactly the two contract fields.
    expect(Object.keys(created[0]?.body ?? {}).sort()).toEqual(["serviceId", "startsAt"]);
  });

  it("never shows a Pending status anywhere in the flow", async () => {
    captureCreate(() => HttpResponse.json(bookingFixture(), { status: 201 }));
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () => HttpResponse.json(bookingFixture())),
      http.get(`${API_ORIGIN}/v1/catalog/services/:id`, () => HttpResponse.json(HAIRCUT)),
    );

    const { user, container } = renderBooking();
    await chooseHaircutThenTime(user);
    expect(container.textContent).not.toMatch(/pending/i);

    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    await screen.findByText("Booking confirmed");
    expect(container.textContent).not.toMatch(/pending/i);
    expect(container.textContent).not.toMatch(/draft/i);
  });

  it("renders no client/customer selection step at any point", async () => {
    const { user, container } = renderBooking();

    const forbidden = /client|customer|attendee|guest/i;
    expect(container.textContent).not.toMatch(forbidden);

    await user.click(await screen.findByRole("radio", { name: /Haircut/ }));
    await user.click(screen.getByRole("button", { name: "Continue to time" }));
    expect(container.textContent).not.toMatch(forbidden);

    await user.type(await screen.findByLabelText(/Starts at/), "2026-10-01T09:00");
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    expect(container.textContent).not.toMatch(forbidden);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    // The only text control in the whole flow is the start time.
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("preserves the service and time when Back is used from Review", async () => {
    const { user } = renderBooking();
    await chooseHaircutThenTime(user);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect((await screen.findByLabelText(/Starts at/)).getAttribute("value")).toBe(
      "2026-10-01T09:00",
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    const haircut = await screen.findByRole<HTMLInputElement>("radio", { name: /Haircut/ });
    expect(haircut.checked).toBe(true);
  });

  it("preserves the selections when the server rejects the booking as invalid", async () => {
    captureCreate(() => HttpResponse.json(problemBody("validation", 422), { status: 422 }));

    const { user } = renderBooking();
    await chooseHaircutThenTime(user);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText("This booking couldn't be created")).toBeDefined();
    expect(
      within(screen.getByRole("region", { name: "Check your answers" })).getByText("Haircut"),
    ).toBeDefined();
  });

  it("offers an actionable 'choose another time' on booking-overlap and keeps the selections", async () => {
    captureCreate(() => HttpResponse.json(problemBody("booking-overlap", 409), { status: 409 }));

    const { user } = renderBooking();
    await chooseHaircutThenTime(user);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText("That time is already booked")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Choose another time" }));
    expect((await screen.findByLabelText(/Starts at/)).getAttribute("value")).toBe(
      "2026-10-01T09:00",
    );

    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    const haircutStillSelected = within(
      screen.getByRole("region", { name: "Check your answers" }),
    ).getByText("Haircut");
    expect(haircutStillSelected).toBeDefined();
  });

  it("reuses the SAME idempotency key when retrying the identical submission", async () => {
    captureCreate((attempt) =>
      attempt === 0
        ? HttpResponse.json(problemBody("internal", 500), { status: 500 })
        : HttpResponse.json(bookingFixture(), { status: 201 }),
    );
    server.use(
      http.get(`${API_ORIGIN}/v1/bookings/:id`, () => HttpResponse.json(bookingFixture())),
      http.get(`${API_ORIGIN}/v1/catalog/services/:id`, () => HttpResponse.json(HAIRCUT)),
    );

    const { user } = renderBooking();
    await chooseHaircutThenTime(user);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(created).toHaveLength(2));

    expect(created[0]?.idempotencyKey).toBeTruthy();
    expect(created[1]?.idempotencyKey).toBe(created[0]?.idempotencyKey);
  });

  it("mints a NEW idempotency key once the operator materially edits the time", async () => {
    captureCreate(() => HttpResponse.json(problemBody("booking-overlap", 409), { status: 409 }));

    const { user } = renderBooking();
    await chooseHaircutThenTime(user);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    await screen.findByText("That time is already booked");

    await user.click(screen.getByRole("button", { name: "Choose another time" }));
    const field = await screen.findByLabelText(/Starts at/);
    await user.clear(field);
    await user.type(field, "2026-10-01T11:00");
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    await user.click(await screen.findByRole("button", { name: "Confirm booking" }));

    await waitFor(() => expect(created).toHaveLength(2));
    expect(created[1]?.idempotencyKey).not.toBe(created[0]?.idempotencyKey);
  });

  it("renders a permission state, and issues no request, without the required capabilities", async () => {
    let requested = false;
    server.use(
      http.get(`${API_ORIGIN}/v1/catalog/services`, () => {
        requested = true;
        return HttpResponse.json({ items: [HAIRCUT], nextCursor: null });
      }),
    );

    renderBooking({ permissions: ["booking:read"] });

    expect(
      await screen.findByRole("heading", { name: /can't create bookings here/i }),
    ).toBeDefined();
    expect(requested).toBe(false);
  });

  it("renders a server 403 as a permission state rather than a generic failure", async () => {
    servicesFail(403, "forbidden");
    renderBooking();

    expect(await screen.findByText("You can't view services here")).toBeDefined();
  });
});
