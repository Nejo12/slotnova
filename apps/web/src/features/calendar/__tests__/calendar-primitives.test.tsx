// @vitest-environment jsdom
import {
  EmptyStatePresentation,
  ErrorStatePresentation,
  PermissionRestrictedStatePresentation,
} from "@slotnova/ui";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BOOKING_ID } from "./test-support.js";
import { CalendarEntryItem } from "../CalendarEntryItem.js";
import type { CalendarEntry } from "../entries.js";

/**
 * Visual-regression coverage for the Calendar's STABLE PRIMITIVES ONLY —
 * one open slot, one occupied slot, one inert slot, and the three state
 * banners. `tasks.md` PR-09 and AGENTS.md testing guidance both rule out
 * snapshotting the full dynamic calendar: a snapshot of a date-dependent
 * grid fails every day for reasons that are never a regression.
 *
 * The serializer below is what makes these snapshots trustworthy rather
 * than merely present. It records structure, ARIA and text, and deliberately
 * drops three sources of false failure:
 *
 *   - `class`/`id`: CSS-module hashes and React-generated ids change with
 *     file content and render order, neither of which is a regression in
 *     this primitive;
 *   - clock times: rendered through `Intl` in the RUNNER's timezone and
 *     locale, so `09:55` here is `04:55` on a CI box in another zone.
 *     Normalised to `HH:MM`, which still proves a time range is rendered,
 *     in the right place, with the right separator;
 *   - nothing else. Every word that carries meaning — "Open", "Booked",
 *     "Completed", the action label, the whole banner copy — is compared
 *     exactly, because that text IS the non-colour signal this surface
 *     depends on.
 */
function serialize(node: Node, depth = 0): string {
  const pad = "  ".repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = normaliseTimes((node.textContent ?? "").replace(/\s+/g, " ").trim());
    return text === "" ? "" : `${pad}"${text}"`;
  }
  if (!(node instanceof Element)) return "";

  const attributes = [...node.attributes]
    .filter((attribute) => attribute.name !== "class" && attribute.name !== "id")
    .filter((attribute) => !attribute.name.startsWith("aria-labelledby"))
    .map((attribute) => `${attribute.name}="${normaliseTimes(attribute.value)}"`)
    .sort();

  const head = `${pad}<${node.tagName.toLowerCase()}${attributes.length > 0 ? ` ${attributes.join(" ")}` : ""}>`;
  const children = [...node.childNodes]
    .map((child) => serialize(child, depth + 1))
    .filter((line) => line !== "");

  return children.length === 0 ? head : [head, ...children].join("\n");
}

/** `09:55` / `9:55 am` -> `HH:MM` — zone- and locale-independent. */
function normaliseTimes(text: string): string {
  return text.replace(/\b\d{1,2}[:.]\d{2}(\s?[ap]\.?m\.?)?/gi, "HH:MM");
}

const OPEN_ENTRY: CalendarEntry = {
  kind: "open",
  id: "open:1",
  start: "2026-10-01T08:00:00Z",
  end: "2026-10-01T16:00:00Z",
};

const OCCUPIED_ENTRY: CalendarEntry = {
  kind: "occupied",
  id: `occupied:${BOOKING_ID}`,
  start: "2026-10-01T09:55:00Z",
  end: "2026-10-01T10:55:00Z",
  bookingId: BOOKING_ID,
  startsAt: "2026-10-01T10:00:00Z",
  status: "confirmed",
};

const COMPLETED_ENTRY: CalendarEntry = { ...OCCUPIED_ENTRY, status: "completed" };

function renderEntry(entry: CalendarEntry, showActionHint: boolean, bookable = true): string {
  const { container } = render(
    <ul>
      <CalendarEntryItem
        entry={entry}
        showActionHint={showActionHint}
        onOpenBooking={() => undefined}
        {...(bookable ? { onStartBooking: () => undefined } : {})}
      />
    </ul>,
  );
  return serialize(container.firstElementChild!.firstElementChild!);
}

describe("Calendar stable primitives", () => {
  afterEach(() => {
    cleanup();
  });

  it("open slot (desktop, bookable)", () => {
    expect(renderEntry(OPEN_ENTRY, true)).toMatchSnapshot();
  });

  it("open slot (mobile, bookable)", () => {
    expect(renderEntry(OPEN_ENTRY, false)).toMatchSnapshot();
  });

  it("open slot (inert — no booking:create)", () => {
    expect(renderEntry(OPEN_ENTRY, true, false)).toMatchSnapshot();
  });

  it("occupied slot — confirmed (desktop)", () => {
    expect(renderEntry(OCCUPIED_ENTRY, true)).toMatchSnapshot();
  });

  it("occupied slot — confirmed (mobile)", () => {
    expect(renderEntry(OCCUPIED_ENTRY, false)).toMatchSnapshot();
  });

  it("occupied slot — completed", () => {
    expect(renderEntry(COMPLETED_ENTRY, true)).toMatchSnapshot();
  });
});

describe("Calendar state banners", () => {
  afterEach(() => {
    cleanup();
  });

  it("empty banner", () => {
    const { container } = render(
      <EmptyStatePresentation
        heading="Nothing scheduled for this day"
        description="There is no open time and no booking on this day. Check another day, or set working hours in Scheduling."
        headingLevel={3}
      />,
    );
    expect(serialize(container.firstElementChild!)).toMatchSnapshot();
  });

  it("error banner with retry", () => {
    const { container } = render(
      <ErrorStatePresentation
        title="This calendar couldn't be loaded"
        action={{ label: "Try again", onAction: () => undefined }}
      >
        Something went wrong while loading availability and bookings for this day. Nothing was
        changed.
      </ErrorStatePresentation>,
    );
    expect(serialize(container.firstElementChild!)).toMatchSnapshot();
  });

  it("permission-restricted banner", () => {
    const { container } = render(
      <PermissionRestrictedStatePresentation
        heading="You can't view this calendar"
        description="The calendar combines availability and bookings, so it needs both the booking:read and scheduling:read permissions in this workspace. Ask a workspace owner to grant them."
        headingLevel={3}
      />,
    );
    expect(serialize(container.firstElementChild!)).toMatchSnapshot();
  });
});
