import { describe, expect, it } from "vitest";

import {
  InvalidServiceCategoryNameError,
  InvalidServiceCategorySortOrderError,
  assertValidServiceCategoryCreateInput,
} from "../domain/service-category.js";

describe("ServiceCategory creation invariants (research.md R-CAT)", () => {
  it("accepts a valid name with default sort order", () => {
    expect(() => assertValidServiceCategoryCreateInput({ name: "Massage" })).not.toThrow();
  });

  it("accepts an explicit sort order", () => {
    expect(() =>
      assertValidServiceCategoryCreateInput({ name: "Massage", sortOrder: 3 }),
    ).not.toThrow();
  });

  it("rejects a blank name", () => {
    expect(() => assertValidServiceCategoryCreateInput({ name: "   " })).toThrow(
      InvalidServiceCategoryNameError,
    );
  });

  it("rejects a non-integer sort order", () => {
    expect(() =>
      assertValidServiceCategoryCreateInput({ name: "Massage", sortOrder: 1.5 }),
    ).toThrow(InvalidServiceCategorySortOrderError);
  });
});
