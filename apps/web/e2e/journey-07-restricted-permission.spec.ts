import { expect, test } from "@playwright/test";

import { signIn } from "./support/sign-in.js";

/**
 * Journey 7 (T063): retargeted onto the real production shell. No
 * member-management/invitation UI exists in the shell (out of scope for
 * T058-T063 — inventing one solely for this test would be product
 * behavior this PR must not add). Per the task's own guidance for exactly
 * this situation, the protected action is triggered via `page.request`
 * reusing the SAME authenticated browser context (session + CSRF cookies)
 * that renders the real shell — proving genuine server-side denial for a
 * session that actually renders production UI, with zero invented shell
 * UI and no client-side permission check standing in for the server's
 * decision.
 */
test("journey 7: restricted user is denied invitations server-side (real shell session)", async ({
  page,
}) => {
  await signIn(page, "staff@example.test");

  // Establish the real shell render for this session before proving
  // server-side denial — the point is that THIS session (the one actually
  // rendering the shell) gets denied, not an isolated/unrelated request.
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  const csrfCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "slotnova_csrf",
  );
  expect(csrfCookie?.value).toBeTruthy();

  const response = await page.request.post("http://127.0.0.1:3001/v1/invitations", {
    headers: { "x-csrf-token": csrfCookie!.value, "content-type": "application/json" },
    data: { email: "new-member@example.test", role: "staff" },
  });

  expect(response.status()).toBe(403);

  const problem = (await response.json()) as { type: string; requiredCapability: string };
  expect(problem.type).toContain("/problems/forbidden");
  expect(problem.requiredCapability).toBe("members:invite");
});
