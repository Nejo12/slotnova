import { EmptyStatePresentation } from "@slotnova/ui";

export interface PlaceholderRouteProps {
  destination: string;
}

/**
 * Shared empty/coming-later placeholder (T060) for every product
 * destination. No product data fetching, no product business logic, no
 * forms — this establishes shell IA only. Uses the shared Slotnova
 * system-state presentation (packages/ui) rather than a duplicate local
 * empty state.
 */
export function PlaceholderRoute({ destination }: PlaceholderRouteProps): React.JSX.Element {
  return (
    <EmptyStatePresentation
      heading={`${destination} is coming later`}
      description="This destination is reachable now; the feature itself arrives in a later phase."
    />
  );
}
