import { describe, expect, it } from "vitest";

import { checkProviderSmokeSeam } from "../check-seam.js";

describe("checkProviderSmokeSeam", () => {
  it("reports the seam is wired when the marker env var is present", () => {
    const result = checkProviderSmokeSeam({ PROVIDER_SMOKE_SEAM: "1" });
    expect(result.seamWired).toBe(true);
    expect(result.hasRealProviderAdapter).toBe(false);
    expect(result.summary).toMatch(/no Phase-1 provider adapter exists yet/i);
  });

  it("reports the seam is NOT wired when the marker env var is absent", () => {
    const result = checkProviderSmokeSeam({});
    expect(result.seamWired).toBe(false);
  });
});
