import { RouterProvider } from "react-router";

import { AppProviders } from "./app/providers/AppProviders.js";
import { router } from "./app/router.js";

/**
 * Application root (T058). Supersedes the T025 skeleton: the shell now
 * owns routing, session gating and theming instead of a standalone health
 * ping. `apps/web/src/health/check-api-health.ts` remains available for
 * reuse (e.g. a future health-aware system state) but is no longer wired
 * to the root.
 */
export function App(): React.JSX.Element {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
