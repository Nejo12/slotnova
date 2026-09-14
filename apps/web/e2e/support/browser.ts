import type { Browser, BrowserContext } from "@playwright/test";

/** A genuinely isolated cookie/session jar for cross-operator journeys. */
export function secondContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: "http://127.0.0.1:3000" });
}
