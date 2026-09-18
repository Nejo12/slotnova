/**
 * Runtime-schema coverage for the `/v1/bookings` HTTP boundary (PR-07,
 * issue #73). These are the schemas that are simultaneously the runtime
 * validator and the OpenAPI source, so what is asserted here is what the
 * generated contract publishes — there is no second hand-written shape to
 * keep in sync.
 *
 * Fast lane (no database): these assert parsing behavior only. The 400/422
 * status mapping those failures produce over HTTP is proved in
 * `booking.contract.test.ts` against the real app.
 */
import { describe, expect, it } from "vitest";

import {
  bookingIdParamSchema,
  bookingResponseSchema,
  cancelBookingRequestSchema,
  completeBookingRequestSchema,
  createBookingRequestSchema,
  listBookingsQuerySchema,
  rescheduleBookingRequestSchema,
} from "../booking.schema.js";

const SERVICE_ID = "11111111-1111-4111-8111-111111111111";
const STARTS_AT = "2026-09-01T09:00:00Z";

/**
 * The four dimensions Phase 2 does not have (`research.md` R-SCOPE,
 * R-LOCATION, R-CLIENTS; Founder decisions 3 & 4; FR-029). Every request
 * schema must REJECT each one rather than silently dropping it — a client
 * that sends `clientId` and gets a 201 would reasonably believe a customer
 * was attached to the booking.
 */
const DEFERRED_FIELDS = ["clientId", "resourceId", "locationId", "staffId"] as const;

describe("createBookingRequestSchema", () => {
  it("accepts exactly the contract's two fields", () => {
    const parsed = createBookingRequestSchema.parse({
      serviceId: SERVICE_ID,
      startsAt: STARTS_AT,
    });
    expect(Object.keys(parsed).sort()).toEqual(["serviceId", "startsAt"]);
  });

  it.each(DEFERRED_FIELDS)("rejects a %s field rather than ignoring it", (field) => {
    const result = createBookingRequestSchema.safeParse({
      serviceId: SERVICE_ID,
      startsAt: STARTS_AT,
      [field]: SERVICE_ID,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["serviceDurationMinutes", 45],
    ["preBufferMinutes", 5],
    ["postBufferMinutes", 10],
    ["status", "confirmed"],
    ["version", 1],
    ["blockingRange", { start: STARTS_AT, end: STARTS_AT }],
  ])("rejects the server-derived field %s", (field, value) => {
    const result = createBookingRequestSchema.safeParse({
      serviceId: SERVICE_ID,
      startsAt: STARTS_AT,
      [field]: value,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a startsAt without an explicit UTC offset", () => {
    expect(
      createBookingRequestSchema.safeParse({
        serviceId: SERVICE_ID,
        startsAt: "2026-09-01T09:00:00",
      }).success,
    ).toBe(false);
  });

  it("rejects an impossible calendar instant", () => {
    expect(
      createBookingRequestSchema.safeParse({
        serviceId: SERVICE_ID,
        startsAt: "2026-02-30T09:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects a serviceId that is not a uuid", () => {
    expect(
      createBookingRequestSchema.safeParse({ serviceId: "not-a-uuid", startsAt: STARTS_AT })
        .success,
    ).toBe(false);
  });

  it("accepts an equivalent instant written with a non-UTC offset", () => {
    // Fingerprint normalization depends on these parsing; the controller is
    // what collapses them to the same canonical instant.
    expect(
      createBookingRequestSchema.safeParse({
        serviceId: SERVICE_ID,
        startsAt: "2026-09-01T10:00:00+01:00",
      }).success,
    ).toBe(true);
  });
});

describe("listBookingsQuerySchema", () => {
  it("requires both window bounds", () => {
    expect(listBookingsQuerySchema.safeParse({ from: STARTS_AT }).success).toBe(false);
    expect(listBookingsQuerySchema.safeParse({ to: STARTS_AT }).success).toBe(false);
    expect(listBookingsQuerySchema.safeParse({}).success).toBe(false);
  });

  it("accepts a bounded window with no status filter", () => {
    const parsed = listBookingsQuerySchema.parse({
      from: STARTS_AT,
      to: "2026-09-02T09:00:00Z",
    });
    expect(parsed.status).toBeUndefined();
  });

  it("accepts each of the three persisted statuses", () => {
    for (const status of ["confirmed", "completed", "cancelled"]) {
      const parsed = listBookingsQuerySchema.parse({
        from: STARTS_AT,
        to: "2026-09-02T09:00:00Z",
        status,
      });
      expect(parsed.status).toBe(status);
    }
  });

  it.each(["pending", "draft"])("rejects the non-existent status %s", (status) => {
    expect(
      listBookingsQuerySchema.safeParse({ from: STARTS_AT, to: STARTS_AT, status }).success,
    ).toBe(false);
  });

  it.each([...DEFERRED_FIELDS, "cursor", "limit", "serviceId"])(
    "rejects the unsupported query parameter %s",
    (field) => {
      expect(
        listBookingsQuerySchema.safeParse({
          from: STARTS_AT,
          to: "2026-09-02T09:00:00Z",
          [field]: "x",
        }).success,
      ).toBe(false);
    },
  );

  it("does NOT reject an inverted window here — that invariant is the domain's (422)", () => {
    expect(
      listBookingsQuerySchema.safeParse({ from: "2026-09-02T09:00:00Z", to: STARTS_AT }).success,
    ).toBe(true);
  });
});

describe("rescheduleBookingRequestSchema", () => {
  it("accepts exactly { version, startsAt }", () => {
    const parsed = rescheduleBookingRequestSchema.parse({ version: 1, startsAt: STARTS_AT });
    expect(Object.keys(parsed).sort()).toEqual(["startsAt", "version"]);
  });

  it("rejects a serviceId — reschedule never re-snapshots the Service", () => {
    expect(
      rescheduleBookingRequestSchema.safeParse({
        version: 1,
        startsAt: STARTS_AT,
        serviceId: SERVICE_ID,
      }).success,
    ).toBe(false);
  });

  it.each(["serviceDurationMinutes", "preBufferMinutes", "postBufferMinutes"])(
    "rejects the snapshot field %s",
    (field) => {
      expect(
        rescheduleBookingRequestSchema.safeParse({
          version: 1,
          startsAt: STARTS_AT,
          [field]: 30,
        }).success,
      ).toBe(false);
    },
  );

  it("requires a version", () => {
    expect(rescheduleBookingRequestSchema.safeParse({ startsAt: STARTS_AT }).success).toBe(false);
  });

  it.each([0, -1, 1.5])("rejects the non-version value %s", (version) => {
    expect(rescheduleBookingRequestSchema.safeParse({ version, startsAt: STARTS_AT }).success).toBe(
      false,
    );
  });
});

describe("cancelBookingRequestSchema", () => {
  it("accepts a version alone", () => {
    const parsed = cancelBookingRequestSchema.parse({ version: 2 });
    expect(parsed.reason).toBeUndefined();
  });

  it("accepts an optional reason", () => {
    expect(cancelBookingRequestSchema.parse({ version: 2, reason: "Client called" }).reason).toBe(
      "Client called",
    );
  });

  it("rejects a blank reason rather than storing an empty string", () => {
    expect(cancelBookingRequestSchema.safeParse({ version: 2, reason: "" }).success).toBe(false);
  });

  it.each(DEFERRED_FIELDS)("rejects a %s field", (field) => {
    expect(cancelBookingRequestSchema.safeParse({ version: 2, [field]: SERVICE_ID }).success).toBe(
      false,
    );
  });

  it("rejects a status field — the caller never chooses the target state", () => {
    expect(cancelBookingRequestSchema.safeParse({ version: 2, status: "cancelled" }).success).toBe(
      false,
    );
  });
});

describe("completeBookingRequestSchema", () => {
  it("accepts exactly { version }", () => {
    expect(Object.keys(completeBookingRequestSchema.parse({ version: 3 }))).toEqual(["version"]);
  });

  it("rejects anything else", () => {
    expect(
      completeBookingRequestSchema.safeParse({ version: 3, completedAt: STARTS_AT }).success,
    ).toBe(false);
  });
});

describe("bookingResponseSchema", () => {
  const validResponse = {
    id: "22222222-2222-4222-8222-222222222222",
    serviceId: SERVICE_ID,
    startsAt: STARTS_AT,
    serviceDurationMinutes: 45,
    preBufferMinutes: 5,
    postBufferMinutes: 10,
    blockingRange: { start: "2026-09-01T08:55:00Z", end: "2026-09-01T09:55:00Z" },
    status: "confirmed",
    version: 1,
    cancelledReason: null,
  };

  it("publishes exactly the accepted field set — no workspaceId, no deferred dimension", () => {
    const parsed = bookingResponseSchema.parse(validResponse);
    expect(Object.keys(parsed).sort()).toEqual([
      "blockingRange",
      "cancelledReason",
      "id",
      "postBufferMinutes",
      "preBufferMinutes",
      "serviceDurationMinutes",
      "serviceId",
      "startsAt",
      "status",
      "version",
    ]);
  });

  it.each(["pending", "draft"])("rejects the non-existent status %s", (status) => {
    expect(bookingResponseSchema.safeParse({ ...validResponse, status }).success).toBe(false);
  });
});

describe("bookingIdParamSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(bookingIdParamSchema.safeParse(SERVICE_ID).success).toBe(true);
    expect(bookingIdParamSchema.safeParse("nope").success).toBe(false);
  });
});
