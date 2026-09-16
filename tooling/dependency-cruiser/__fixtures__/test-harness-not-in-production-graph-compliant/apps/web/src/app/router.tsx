// Compliant: the one sanctioned entry point, matching the real
// apps/web/src/app/router.tsx pattern — a dynamic import behind VITE_E2E.
export async function loadTestHarnessRoute() {
  if (import.meta.env.VITE_E2E !== "true") return null;
  return import("../test-harness/TestHarness.js");
}
