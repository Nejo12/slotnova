import { describe, expect, it } from "vitest";

import { composeHandlers, http, HttpResponse } from "../handlers.js";
import { createMswServer, setupMswServerLifecycle } from "../node.js";

const PING = "https://api.slotnova.test/ping";

const server = createMswServer(
  composeHandlers([http.get(PING, () => HttpResponse.json({ pong: true }))]),
);

// Exercises createMswServer + composeHandlers + the lifecycle helper itself.
setupMswServerLifecycle(server, { onUnhandledRequest: "error" });

describe("MSW node harness", () => {
  it("intercepts a request and returns the deterministic mocked response", async () => {
    const response = await fetch(PING);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
  });

  it("honours a per-test override registered with server.use", async () => {
    server.use(http.get(PING, () => HttpResponse.json({ pong: false }, { status: 503 })));
    const response = await fetch(PING);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ pong: false });
  });

  it("resets overrides between tests so nothing leaks from the previous test", async () => {
    const response = await fetch(PING);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
  });

  it("fails the test via MSW instead of making a real network call for an unhandled request", async () => {
    // `onUnhandledRequest: "error"` makes MSW reject the request before it can
    // leave the process; the rejection text is MSW's, not a DNS/socket error.
    await expect(fetch("https://api.slotnova.test/not-mocked")).rejects.toThrow(/^\[MSW\]/);
  });
});
