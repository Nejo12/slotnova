import { expect, test } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

/**
 * Journey 6 (T063): retargeted from the test-nav harness onto the real
 * production shell (PR-14). The harness is used ONLY to establish the
 * session; every workspace-selection, -switch and isolation assertion
 * below runs against the real shell's WorkspaceSwitcher, matching
 * contracts/workspace-context.contract.md's client obligation on switch.
 */
test("journey 6: workspace switch clears prior-workspace state in the real shell", async ({
  page,
}) => {
  // owner@example.test has memberships in both E2E Alpha and E2E Beta, so
  // sign-in leaves activeWorkspace null until an explicit selection
  // (contracts/session.contract.md) — proven via the real shell's own
  // WorkspaceSwitcher, which doubles as the initial-selection control.
  await signIn(page, "owner@example.test");

  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  const switcher = page.getByRole("button", { name: /Workspace switcher/ });
  await expect(switcher).toContainText("Select a workspace");

  await switcher.click();
  await page.getByRole("menuitem", { name: "E2E Alpha Workspace" }).click();
  await expect(page.getByRole("button", { name: /Workspace switcher/ })).toContainText(
    "E2E Alpha Workspace",
  );
  await expect(page.getByText("E2E Beta Workspace")).toHaveCount(0);

  const beforeCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "slotnova_session",
  );

  await page.getByRole("button", { name: /Workspace switcher/ }).click();
  await page.getByRole("menuitem", { name: "E2E Beta Workspace" }).click();

  // B active, proven through the shell's own WorkspaceSwitcher label —
  // this is the shell surface that exposes the active-workspace proof.
  await expect(page.getByRole("button", { name: /Workspace switcher/ })).toContainText(
    "E2E Beta Workspace",
  );

  // No stale A records remain anywhere in the shell: the prior workspace's
  // name is gone entirely, not merely relabeled in the switcher while
  // lingering elsewhere (AccountMenu, page content, etc).
  await expect(page.getByText("E2E Alpha Workspace")).toHaveCount(0);

  // The session id rotated (server-authoritative switch, not a client-only
  // relabel) — same tenant-isolation proof the original journey required.
  const afterCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "slotnova_session",
  );
  expect(beforeCookie?.value).toBeTruthy();
  expect(afterCookie?.value).toBeTruthy();
  expect(afterCookie?.value).not.toBe(beforeCookie?.value);
});
