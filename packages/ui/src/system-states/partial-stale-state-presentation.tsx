import { InlineAlert } from "@nova-component/ui";
import type { ReactNode } from "react";

export interface PartialStaleStatePresentationProps {
  title: ReactNode;
  /** Last-updated context (e.g. "Last updated 5 minutes ago.") — required, not optional. */
  children: ReactNode;
}

/**
 * "Partial / stale data" system state. Uses Nova's `InlineAlert` with
 * `tone="info"` and a polite announcement, so stale numbers are never
 * presented as current truth without visible last-updated context
 * (docs/product-handoff.md).
 */
export function PartialStaleStatePresentation({
  title,
  children,
}: PartialStaleStatePresentationProps) {
  return (
    <InlineAlert title={title} tone="info" announcement="polite">
      {children}
    </InlineAlert>
  );
}
