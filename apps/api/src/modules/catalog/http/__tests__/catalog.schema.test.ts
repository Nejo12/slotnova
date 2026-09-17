/**
 * Runtime-schema coverage for the `/v1/catalog/*` HTTP boundary (PR-02,
 * issue #60). These are the schemas that are simultaneously the runtime
 * validator and the OpenAPI source, so what is asserted here is what the
 * generated contract publishes — there is no second hand-written shape to
 * keep in sync.
 *
 * Fast lane (no database): these assert parsing behavior only. The 400/422
 * status mapping those failures produce over HTTP is proved in
 * `catalog.contract.test.ts` against the real app.
 */
import { describe, expect, it } from "vitest";

import {
  SERVICE_LIST_DEFAULT_LIMIT,
  SERVICE_LIST_MAX_LIMIT,
  createServiceCategoryRequestSchema,
  createServiceRequestSchema,
  listServicesQuerySchema,
  serviceIdParamSchema,
  updateServiceRequestSchema,
} from "../catalog.schema.js";

const validCreate = {
  name: "Cut & finish",
  durationMinutes: 45,
  priceAmountMinor: 4500,
  priceCurrency: "GBP",
};

describe("createServiceRequestSchema", () => {
  it("accepts the contract's documented field set", () => {
    const parsed = createServiceRequestSchema.parse({
      ...validCreate,
      categoryId: "11111111-1111-4111-8111-111111111111",
      preBufferMinutes: 5,
      postBufferMinutes: 10,
    });
    expect(parsed.preBufferMinutes).toBe(5);
    expect(parsed.postBufferMinutes).toBe(10);
  });

  it("leaves optional fields absent rather than defaulting them", () => {
    const parsed = createServiceRequestSchema.parse(validCreate);
    expect(Object.keys(parsed).sort()).toEqual([
      "durationMinutes",
      "name",
      "priceAmountMinor",
      "priceCurrency",
    ]);
  });

  it("rejects an unexpected property instead of silently dropping it", () => {
    // Load-bearing for idempotency: a dropped unknown field would make two
    // materially different requests fingerprint identically.
    const result = createServiceRequestSchema.safeParse({ ...validCreate, deposit: 500 });
    expect(result.success).toBe(false);
  });

  it("rejects the deferred add-on and staff-capability surfaces outright", () => {
    expect(createServiceRequestSchema.safeParse({ ...validCreate, addOns: [] }).success).toBe(
      false,
    );
    expect(createServiceRequestSchema.safeParse({ ...validCreate, staffIds: ["x"] }).success).toBe(
      false,
    );
  });

  it.each([
    ["missing name", { ...validCreate, name: undefined }],
    ["blank name", { ...validCreate, name: "" }],
    ["non-integer duration", { ...validCreate, durationMinutes: 45.5 }],
    ["non-integer price", { ...validCreate, priceAmountMinor: 45.5 }],
    ["non-uuid categoryId", { ...validCreate, categoryId: "not-a-uuid" }],
    ["missing currency", { ...validCreate, priceCurrency: undefined }],
  ])("rejects %s", (_label, payload) => {
    expect(createServiceRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("updateServiceRequestSchema", () => {
  it("accepts an `active` toggle on its own", () => {
    expect(updateServiceRequestSchema.parse({ active: false })).toEqual({ active: false });
  });

  it("distinguishes a cleared category (null) from an unchanged one (absent)", () => {
    expect(updateServiceRequestSchema.parse({ categoryId: null }).categoryId).toBeNull();
    expect(updateServiceRequestSchema.parse({}).categoryId).toBeUndefined();
  });

  it("rejects half a price — amount and currency are one value", () => {
    expect(updateServiceRequestSchema.safeParse({ priceAmountMinor: 100 }).success).toBe(false);
    expect(updateServiceRequestSchema.safeParse({ priceCurrency: "GBP" }).success).toBe(false);
    expect(
      updateServiceRequestSchema.safeParse({ priceAmountMinor: 100, priceCurrency: "GBP" }).success,
    ).toBe(true);
  });

  it("rejects immutable/unknown properties", () => {
    expect(updateServiceRequestSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(updateServiceRequestSchema.safeParse({ workspaceId: "x" }).success).toBe(false);
  });
});

describe("listServicesQuerySchema", () => {
  it("defaults the page size and leaves `active` unfiltered when absent", () => {
    const parsed = listServicesQuerySchema.parse({});
    expect(parsed.limit).toBe(SERVICE_LIST_DEFAULT_LIMIT);
    expect(parsed.active).toBeUndefined();
  });

  it("normalizes the string query value into a boolean filter", () => {
    expect(listServicesQuerySchema.parse({ active: "true" }).active).toBe(true);
    expect(listServicesQuerySchema.parse({ active: "false" }).active).toBe(false);
  });

  it("rejects a non-boolean `active`, a non-uuid cursor and an out-of-range limit", () => {
    expect(listServicesQuerySchema.safeParse({ active: "yes" }).success).toBe(false);
    expect(listServicesQuerySchema.safeParse({ cursor: "nope" }).success).toBe(false);
    expect(listServicesQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(
      listServicesQuerySchema.safeParse({ limit: String(SERVICE_LIST_MAX_LIMIT + 1) }).success,
    ).toBe(false);
  });
});

describe("createServiceCategoryRequestSchema", () => {
  it("accepts name plus optional sortOrder and nothing else", () => {
    expect(createServiceCategoryRequestSchema.parse({ name: "Colour", sortOrder: 2 })).toEqual({
      name: "Colour",
      sortOrder: 2,
    });
    // Founder-finalized R-CAT: no nesting/description/icon surface exists.
    expect(
      createServiceCategoryRequestSchema.safeParse({ name: "Colour", parentId: "x" }).success,
    ).toBe(false);
    expect(
      createServiceCategoryRequestSchema.safeParse({ name: "Colour", icon: "scissors" }).success,
    ).toBe(false);
  });
});

describe("serviceIdParamSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(serviceIdParamSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(
      true,
    );
    expect(serviceIdParamSchema.safeParse("1").success).toBe(false);
  });
});
