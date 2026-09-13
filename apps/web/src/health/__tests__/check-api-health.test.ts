import { afterEach, describe, expect, it, vi } from "vitest";

import { checkApiHealth } from "../check-api-health.js";

describe("checkApiHealth (T025)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns healthy when the API responds 200 with status ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ok", service: "api" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkApiHealth("https://api.slotnova.test");

    expect(result).toEqual({ status: "healthy" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.slotnova.test/healthz");
  });

  it("returns unhealthy when the API responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );

    const result = await checkApiHealth("https://api.slotnova.test");

    expect(result).toEqual({ status: "unhealthy", detail: "API responded with status 503" });
  });

  it("returns unhealthy when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await checkApiHealth("https://api.slotnova.test");

    expect(result).toEqual({ status: "unhealthy", detail: "network down" });
  });
});
