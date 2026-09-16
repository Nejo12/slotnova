/**
 * Provider-smoke seam check (task T086).
 *
 * Phase 1 has no real provider adapter or sandbox contract yet (no
 * billing/notifications module exists under apps/api/src/modules). This
 * script deliberately does NOT fabricate a provider integration or claim a
 * sandbox was exercised. It proves the narrow, isolated-credential lane
 * mechanism itself: that provider-smoke.yml's scoped secrets context is
 * wired and reachable, distinct from fast/heavy lane secrets. Once a real
 * Phase-1 provider adapter exists, this script is the place to add the
 * actual sandbox contract call.
 */

export interface ProviderSmokeSeamResult {
  seamWired: boolean;
  hasRealProviderAdapter: boolean;
  summary: string;
}

export function checkProviderSmokeSeam(
  env: Record<string, string | undefined>,
): ProviderSmokeSeamResult {
  const seamWired = env.PROVIDER_SMOKE_SEAM === "1";
  return {
    seamWired,
    hasRealProviderAdapter: false,
    summary: seamWired
      ? "provider-smoke lane seam is wired (scoped secret/marker reachable). " +
        "no Phase-1 provider adapter exists yet -- this lane currently proves " +
        "the isolated-credential CI mechanism, not a real provider sandbox round-trip."
      : "provider-smoke lane seam marker is NOT set -- scoped context is not reachable.",
  };
}

function main(): void {
  const result = checkProviderSmokeSeam(process.env);
  console.log(result.summary);
  if (!result.seamWired) {
    console.error("provider-smoke: seam check failed -- PROVIDER_SMOKE_SEAM not set");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
