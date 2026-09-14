import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { createAppQueryClient } from "../query/query-client.js";
import { RootErrorBoundary } from "./RootErrorBoundary.js";
import { ThemeProvider } from "./ThemeProvider.js";

/**
 * Composes the shell's providers (T058): QueryClientProvider (the sole
 * server-state cache, ADR-003), ThemeProvider (Light/Dark via data-theme,
 * T061) and the root error boundary. One QueryClient instance per app
 * lifetime via useState's lazy initializer, so React Fast Refresh /
 * StrictMode double-invocation never creates a second cache.
 */
export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
