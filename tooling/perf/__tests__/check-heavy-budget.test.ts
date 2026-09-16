import { describe, expect, it } from "vitest";

import { checkHeavyLaneBudget } from "../check-heavy-budget.js";

describe("checkHeavyLaneBudget", () => {
  it("returns withinBudget: null and an explanatory message when no budget is recorded yet", () => {
    const result = checkHeavyLaneBudget(600, null);
    expect(result.withinBudget).toBeNull();
    expect(result.message).toMatch(/no founder-approved heavy-lane budget recorded yet/i);
  });

  it("returns withinBudget: true when observed duration is within an approved budget", () => {
    const result = checkHeavyLaneBudget(500, 900);
    expect(result.withinBudget).toBe(true);
  });

  it("returns withinBudget: false when observed duration exceeds an approved budget", () => {
    const result = checkHeavyLaneBudget(1200, 900);
    expect(result.withinBudget).toBe(false);
    expect(result.message).toMatch(/exceeds/i);
  });
});
