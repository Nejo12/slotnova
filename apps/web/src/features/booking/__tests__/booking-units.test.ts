import { describe, expect, it } from "vitest";

import { problemKindOf } from "../api/problem.js";
import { formatDurationMinutes, instantToLocalInput, localInputToInstant } from "../format.js";
import { keyForIntent, submissionSignature } from "../create/submission-key.js";

describe("problem+json branching", () => {
  it("reads the slug from the contract's `type` URI", () => {
    expect(problemKindOf({ type: "https://slotnova.app/problems/booking-overlap" })).toBe(
      "booking-overlap",
    );
    expect(problemKindOf({ type: "https://slotnova.app/problems/stale-write" })).toBe(
      "stale-write",
    );
    expect(problemKindOf({ type: "https://slotnova.app/problems/invalid-transition" })).toBe(
      "invalid-transition",
    );
  });

  it("never branches on human-readable title/detail text", () => {
    expect(
      problemKindOf({
        type: "https://slotnova.app/problems/internal",
        title: "That time overlaps an existing booking.",
        detail: "booking-overlap",
      }),
    ).toBe("internal");
  });

  it("degrades an unknown or absent type to `unknown` rather than guessing", () => {
    expect(problemKindOf({ type: "https://slotnova.app/problems/brand-new" })).toBe("unknown");
    expect(problemKindOf({ title: "nope" })).toBe("unknown");
    expect(problemKindOf(undefined)).toBe("unknown");
  });
});

describe("idempotency-key lifecycle", () => {
  const intent = { serviceId: "svc-1", startsAt: "2026-10-01T09:00:00.000Z" };

  it("reuses the same key when the intent is unchanged (a transport retry)", () => {
    let issued = 0;
    const generate = (): string => `key-${String(++issued)}`;

    const first = keyForIntent(null, intent, generate);
    const retry = keyForIntent(first, intent, generate);

    expect(retry).toBe(first);
    expect(issued).toBe(1);
  });

  it("mints a NEW key once the service changes", () => {
    let issued = 0;
    const generate = (): string => `key-${String(++issued)}`;

    const first = keyForIntent(null, intent, generate);
    const edited = keyForIntent(first, { ...intent, serviceId: "svc-2" }, generate);

    expect(edited.key).not.toBe(first.key);
    expect(issued).toBe(2);
  });

  it("mints a NEW key once the start time changes", () => {
    let issued = 0;
    const generate = (): string => `key-${String(++issued)}`;

    const first = keyForIntent(null, intent, generate);
    const edited = keyForIntent(
      first,
      { ...intent, startsAt: "2026-10-01T10:00:00.000Z" },
      generate,
    );

    expect(edited.key).not.toBe(first.key);
  });

  it("signs exactly the two fields the request body carries", () => {
    expect(submissionSignature(intent)).toBe("svc-1@2026-10-01T09:00:00.000Z");
  });
});

describe("local wall-clock <-> instant adapter", () => {
  it("round-trips a local datetime-local value through an instant", () => {
    const instant = localInputToInstant("2026-10-01T09:30");
    expect(instant).not.toBeNull();
    expect(instantToLocalInput(instant ?? "")).toBe("2026-10-01T09:30");
  });

  it("returns null for an empty or unparseable value instead of an invalid date", () => {
    expect(localInputToInstant("")).toBeNull();
    expect(localInputToInstant("   ")).toBeNull();
    expect(localInputToInstant("not-a-date")).toBeNull();
  });
});

describe("duration formatting", () => {
  it("renders minutes, hours and mixed durations", () => {
    expect(formatDurationMinutes(45)).toBe("45 min");
    expect(formatDurationMinutes(60)).toBe("1 h");
    expect(formatDurationMinutes(90)).toBe("1 h 30 min");
  });
});
