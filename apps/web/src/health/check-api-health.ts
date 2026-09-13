/**
 * Approved minimal API health ping (T025). Calls the platform `GET /healthz`
 * endpoint only — no product data, no auth. Never throws: callers render the
 * returned status directly.
 */

export type HealthResult = { status: "healthy" } | { status: "unhealthy"; detail: string };

export async function checkApiHealth(apiBaseUrl: string): Promise<HealthResult> {
  try {
    const response = await fetch(`${apiBaseUrl}/healthz`);
    if (!response.ok) {
      return { status: "unhealthy", detail: `API responded with status ${response.status}` };
    }
    return { status: "healthy" };
  } catch (error) {
    return { status: "unhealthy", detail: error instanceof Error ? error.message : String(error) };
  }
}
