// @vitest-environment jsdom
import { http, HttpResponse } from "@slotnova/testing/msw";
import { createMswServer, setupMswServerLifecycle } from "@slotnova/testing/msw/node";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  API_ORIGIN,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
  mixedView,
  mockViewport,
  occupiedOnlyView,
  openOnlyView,
  renderCalendar,
} from "./test-support.js";
import { calendarKey } from "../api/keys.js";
import { dayRangeOf, shiftDay, todayKey } from "../day-range.js";

const server = createMswServer();
setupMswServerLifecycle(server);

/** Records every window the Calendar actually asked the API for. */
function recordWindows(): { windows: { from: string; to: string }[] } {
  const recorded: { from: string; to: string }[] = [];
  server.use(
    http.get(`${API_ORIGIN}/v1/calendar`, ({ request }) => {
      const url = new URL(request.url);
      recorded.push({
        from: url.searchParams.get("from") ?? "",
        to: url.searchParams.get("to") ?? "",
      });
      return HttpResponse.json(mixedView());
    }),
  );
  return { windows: recorded };
}

describe("Calendar date navigation", () => {
  beforeEach(() => {
    mockViewport(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("requests exactly one bounded day — never an unbounded window", async () => {
    const recorder = recordWindows();

    renderCalendar({ path: "/calendar?day=2026-10-01" });

    await screen.findByRole("list", { name: "Day timeline" });
    expect(recorder.windows).toHaveLength(1);
    const expected = dayRangeOf("2026-10-01");
    expect(recorder.windows[0]).toEqual({ from: expected.from, to: expected.to });
  });

  it("steps to the previous day and refetches that day's window", async () => {
    const recorder = recordWindows();

    const { user, currentPath } = renderCalendar({ path: "/calendar?day=2026-10-01" });
    await screen.findByRole("list", { name: "Day timeline" });

    await user.click(screen.getByRole("button", { name: "Previous day" }));

    await waitFor(() => {
      expect(currentPath()).toBe("/calendar?day=2026-09-30");
    });
    await waitFor(() => {
      expect(recorder.windows).toHaveLength(2);
    });
    expect(recorder.windows[1]).toEqual({
      from: dayRangeOf("2026-09-30").from,
      to: dayRangeOf("2026-09-30").to,
    });
  });

  it("steps to the next day", async () => {
    recordWindows();

    const { user, currentPath } = renderCalendar({ path: "/calendar?day=2026-10-01" });
    await screen.findByRole("list", { name: "Day timeline" });

    await user.click(screen.getByRole("button", { name: "Next day" }));

    await waitFor(() => {
      expect(currentPath()).toBe("/calendar?day=2026-10-02");
    });
  });

  it("returns to today, and offers no Today action when already there", async () => {
    recordWindows();
    const today = todayKey();
    const tomorrow = shiftDay(today, 1);

    const { user, currentPath } = renderCalendar({ path: `/calendar?day=${tomorrow}` });
    await screen.findByRole("list", { name: "Day timeline" });

    const todayButton = screen.getByRole("button", { name: "Go to today" });
    expect(todayButton.hasAttribute("disabled")).toBe(false);
    await user.click(todayButton);

    await waitFor(() => {
      expect(currentPath()).toBe(`/calendar?day=${today}`);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Go to today" }).hasAttribute("disabled")).toBe(
        true,
      );
    });
  });

  it("degrades a malformed ?day to today rather than requesting a nonsense window", async () => {
    const recorder = recordWindows();

    renderCalendar({ path: "/calendar?day=the-first-of-never" });

    await screen.findByRole("list", { name: "Day timeline" });
    expect(recorder.windows[0]).toEqual({
      from: dayRangeOf(todayKey()).from,
      to: dayRangeOf(todayKey()).to,
    });
  });

  it("announces the visible day in a live region so a step is not silent", async () => {
    recordWindows();

    renderCalendar({ path: "/calendar?day=2026-10-01" });

    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.getAttribute("aria-live")).toBe("polite");
  });
});

describe("Calendar cache scoping", () => {
  beforeEach(() => {
    mockViewport(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  it("caches under a key scoped to BOTH the workspace and the visible range", async () => {
    recordWindows();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderCalendar({ path: "/calendar?day=2026-10-01", queryClient });
    await screen.findByRole("list", { name: "Day timeline" });

    const range = dayRangeOf("2026-10-01");
    const key = calendarKey(WORKSPACE_ID, range.from, range.to);
    expect(queryClient.getQueryData(key)).toBeTruthy();
    expect(key.slice(0, 2)).toEqual(["ws", WORKSPACE_ID]);
    // Another day is a different resource, not another state of this one.
    const otherDay = dayRangeOf("2026-10-02");
    expect(queryClient.getQueryData(calendarKey(WORKSPACE_ID, otherDay.from, otherDay.to))).toBe(
      undefined,
    );
  });

  it("never serves one workspace's calendar under another workspace's key", async () => {
    server.use(http.get(`${API_ORIGIN}/v1/calendar`, () => HttpResponse.json(occupiedOnlyView())));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderCalendar({ path: "/calendar?day=2026-10-01", queryClient });
    await screen.findByRole("list", { name: "Day timeline" });

    const range = dayRangeOf("2026-10-01");
    expect(queryClient.getQueryData(calendarKey(OTHER_WORKSPACE_ID, range.from, range.to))).toBe(
      undefined,
    );
  });

  it("drops every Calendar entry when the shell clears the cache on workspace switch", async () => {
    server.use(http.get(`${API_ORIGIN}/v1/calendar`, () => HttpResponse.json(openOnlyView())));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderCalendar({ path: "/calendar?day=2026-10-01", queryClient });
    await screen.findByRole("list", { name: "Day timeline" });

    const range = dayRangeOf("2026-10-01");
    expect(queryClient.getQueryData(calendarKey(WORKSPACE_ID, range.from, range.to))).toBeTruthy();

    // What `WorkspaceSwitcher`/logout do.
    queryClient.clear();

    expect(queryClient.getQueryData(calendarKey(WORKSPACE_ID, range.from, range.to))).toBe(
      undefined,
    );
  });
});
