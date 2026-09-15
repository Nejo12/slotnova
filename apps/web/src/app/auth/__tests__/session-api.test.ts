// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { signOut, switchWorkspace } from "../session-api.js";
afterEach(() => vi.restoreAllMocks());
it("prefers secure CSRF cookie for workspace switch and logout without losing credentials mode", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue(
    "slotnova_csrf=untrusted; __Host-slotnova_csrf=secure-token",
  );
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 200 }));
  await switchWorkspace("workspace");
  await signOut();
  for (const [, options] of fetch.mock.calls) {
    expect(options?.credentials).toBe("include");
    expect(options?.headers).toMatchObject({ "x-csrf-token": "secure-token" });
  }
});
it("retains explicit insecure local-development cookie compatibility", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("slotnova_csrf=local-token");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  await signOut();
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-csrf-token": "local-token" });
});
