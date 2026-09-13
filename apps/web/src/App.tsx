import { useEffect, useState } from "react";

import { checkApiHealth, type HealthResult } from "./health/check-api-health.js";

const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3001";

export function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    checkApiHealth(API_BASE_URL).then((result) => {
      if (!cancelled) setHealth(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Slotnova</h1>
      <p>{describeHealth(health)}</p>
    </main>
  );
}

function describeHealth(health: HealthResult | undefined): string {
  if (health === undefined) return "API: checking…";
  if (health.status === "healthy") return "API: healthy";
  return `API: unhealthy — ${health.detail}`;
}
