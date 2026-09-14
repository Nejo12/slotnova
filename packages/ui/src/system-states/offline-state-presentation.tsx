import { InlineAlert } from "@nova-component/ui";
import type { ReactNode } from "react";

export interface OfflineStatePresentationProps {
  title: ReactNode;
  children: ReactNode;
}

/**
 * "Offline / degraded" system state. Uses Nova's `InlineAlert` with
 * `tone="warning"` and a polite announcement — degraded connectivity is
 * worth surfacing but must not interrupt an operator mid-task the way an
 * assertive alert would (docs/product-handoff.md: state what remains
 * available locally and what will sync once connection returns).
 */
export function OfflineStatePresentation({ title, children }: OfflineStatePresentationProps) {
  return (
    <InlineAlert title={title} tone="warning" announcement="polite">
      {children}
    </InlineAlert>
  );
}
