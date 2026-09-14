import { QueryClient } from "@tanstack/react-query";

/**
 * Creates the single QueryClient instance the shell provides via
 * QueryClientProvider. TanStack Query is the sole server-state cache
 * (ADR-003) — route loaders may gate/prefetch through this same client but
 * must never own a second cache.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The shell decides retry/staleness per query via explicit options
        // where it matters (e.g. `useSession` disables retry on 401); the
        // client-wide default stays conservative rather than silently
        // retrying failed tenant-scoped requests.
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}
