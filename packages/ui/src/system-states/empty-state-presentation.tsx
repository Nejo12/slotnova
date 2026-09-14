import { Button, EmptyState, type EmptyStateHeadingLevel } from "@nova-component/ui";
import type { ReactNode } from "react";

import type { SystemStateAction } from "./types.js";

export interface EmptyStatePresentationProps {
  heading: ReactNode;
  description?: ReactNode;
  action?: SystemStateAction;
  headingLevel?: EmptyStateHeadingLevel;
}

/**
 * "Empty" system state (docs/product-handoff.md system-state baseline).
 * A thin Slotnova composition over Nova's `EmptyState` — heading/description
 * communicate the state through text, not color, and the optional action
 * uses Nova's own `Button` so it keeps Nova's keyboard/focus behavior.
 */
export function EmptyStatePresentation({
  heading,
  description,
  action,
  headingLevel,
}: EmptyStatePresentationProps) {
  return (
    <EmptyState
      heading={heading}
      description={description}
      {...(headingLevel !== undefined ? { headingLevel } : {})}
      action={
        action ? (
          <Button type="button" onClick={action.onAction} disabled={action.disabled}>
            {action.label}
          </Button>
        ) : undefined
      }
    />
  );
}
