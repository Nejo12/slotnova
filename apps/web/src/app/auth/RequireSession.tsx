import { EmptyStatePresentation, LoadingStatePresentation } from "@slotnova/ui";
import type { ReactNode } from "react";

import { useSession } from "./use-session.js";

/**
 * Route-gate on GET /v1/me as the server-authoritative session read
 * (contracts/workspace-context.contract.md). Signed-out users never render
 * the authenticated shell (hard requirement); active-workspace state comes
 * entirely from the server response, never a client-local role/claim.
 *
 * There is no sign-in form here — that is real product auth UI outside
 * T058-T063's scope. Local/E2E sessions are established through the
 * VITE_E2E test-harness (apps/web/src/test-harness, production-build
 * excluded); this component only decides what to render once a session
 * decision is known.
 */
export function RequireSession({ children }: { children: ReactNode }): React.JSX.Element {
  const { status } = useSession();

  if (status === "loading") {
    return <LoadingStatePresentation label="Loading your session" />;
  }

  if (status === "signed-out") {
    return (
      <EmptyStatePresentation
        heading="You're signed out"
        description="Sign in to continue to your workspace."
      />
    );
  }

  return <>{children}</>;
}
