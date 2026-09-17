/**
 * Runtime boundary schemas for `/v1/scheduling/*` (PR-04, issue #66).
 *
 * These are the schemas that are simultaneously the request validator and the
 * published OpenAPI shape, so what they accept/reject IS the contract. The
 * assertions below deliberately cover the Phase-2 scope guards (no
 * `resourceId`/`locationId`/`staffId`, no recurring exception) as well as the
 * ordinary shape rules — a schema that silently dropped an unknown property
 * would let a client believe Phase 2 supports a dimension it does not.
 */
import { describe, expect, it } from "vitest";

import {
  createAvailabilityExceptionRequestSchema,
  createAvailabilityPatternRequestSchema,
  resolveAvailabilityRequestSchema,
} from "../scheduling.schema.js";

const validRule = { dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 1020 };

describe("createAvailabilityPatternRequestSchema", () => {
  it("accepts a minimal pattern with no effective bounds", () => {
    const parsed = createAvailabilityPatternRequestSchema.parse({
      timezone: "Europe/London",
      weeklyRule: [validRule],
    });
    expect(parsed.effectiveFrom).toBeUndefined();
    expect(parsed.effectiveUntil).toBeUndefined();
  });

  it("accepts YYYY-MM-DD effective bounds and narrows dayOfWeek to the ISO union", () => {
    const parsed = createAvailabilityPatternRequestSchema.parse({
      timezone: "America/New_York",
      weeklyRule: [validRule, { ...validRule, dayOfWeek: 7 }],
      effectiveFrom: "2026-09-01",
      effectiveUntil: "2026-10-01",
    });
    expect(parsed.effectiveFrom).toBe("2026-09-01");
    expect(parsed.effectiveUntil).toBe("2026-10-01");
    expect(parsed.weeklyRule.map((rule) => rule.dayOfWeek)).toEqual([1, 7]);
  });

  it.each([
    ["a resource dimension", { resourceId: "11111111-1111-4111-8111-111111111111" }],
    ["a location dimension", { locationId: "11111111-1111-4111-8111-111111111111" }],
    ["a staff dimension", { staffId: "11111111-1111-4111-8111-111111111111" }],
  ])("rejects %s rather than silently ignoring it (Founder decisions 3 & 4)", (_label, extra) => {
    const result = createAvailabilityPatternRequestSchema.safeParse({
      timezone: "Europe/London",
      weeklyRule: [validRule],
      ...extra,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["a day outside the ISO range", { ...validRule, dayOfWeek: 0 }],
    ["a day above Sunday", { ...validRule, dayOfWeek: 8 }],
    ["a start minute outside the day", { ...validRule, startMinuteOfDay: 1440 }],
    ["an end minute beyond midnight", { ...validRule, endMinuteOfDay: 1441 }],
    ["a non-integer minute", { ...validRule, startMinuteOfDay: 9.5 }],
    ["an unknown rule property", { ...validRule, weekOfMonth: 2 }],
  ])("rejects %s", (_label, rule) => {
    const result = createAvailabilityPatternRequestSchema.safeParse({
      timezone: "Europe/London",
      weeklyRule: [rule],
    });
    expect(result.success).toBe(false);
  });

  it.each(["2026-9-1", "01-09-2026", "2026-02-30", "2026-09-01T00:00:00Z"])(
    "rejects %s as an effective bound",
    (value) => {
      const result = createAvailabilityPatternRequestSchema.safeParse({
        timezone: "Europe/London",
        weeklyRule: [validRule],
        effectiveFrom: value,
      });
      expect(result.success).toBe(false);
    },
  );
});

describe("createAvailabilityExceptionRequestSchema", () => {
  it("accepts resolved instants with an explicit offset", () => {
    const parsed = createAvailabilityExceptionRequestSchema.parse({
      startsAt: "2026-09-02T09:00:00Z",
      endsAt: "2026-09-02T12:00:00+01:00",
      reason: "Dentist",
    });
    expect(parsed.reason).toBe("Dentist");
  });

  it("rejects a bare local wall time with no offset (FR-012: always resolved instants)", () => {
    const result = createAvailabilityExceptionRequestSchema.safeParse({
      startsAt: "2026-09-02T09:00:00",
      endsAt: "2026-09-02T12:00:00",
    });
    expect(result.success).toBe(false);
  });

  it("has no recurrence representation at all", () => {
    for (const extra of [{ rrule: "FREQ=WEEKLY" }, { frequency: "weekly" }, { dayOfWeek: 1 }]) {
      const result = createAvailabilityExceptionRequestSchema.safeParse({
        startsAt: "2026-09-02T09:00:00Z",
        endsAt: "2026-09-02T12:00:00Z",
        ...extra,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("resolveAvailabilityRequestSchema", () => {
  it("accepts a half-open local-date window", () => {
    expect(
      resolveAvailabilityRequestSchema.parse({ from: "2026-09-01", to: "2026-09-08" }),
    ).toEqual({ from: "2026-09-01", to: "2026-09-08" });
  });

  it("rejects an unknown property such as a resource filter", () => {
    const result = resolveAvailabilityRequestSchema.safeParse({
      from: "2026-09-01",
      to: "2026-09-08",
      resourceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("does not encode the horizon rule (the domain owns it, exactly once)", () => {
    // A 400-day window parses fine at the schema level; it is the PR-03
    // domain that rejects it with a 422 at resolve time.
    expect(
      resolveAvailabilityRequestSchema.safeParse({ from: "2026-01-01", to: "2027-02-05" }).success,
    ).toBe(true);
  });
});
