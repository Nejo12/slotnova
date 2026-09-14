import { Button, EmptyState, type EmptyStateHeadingLevel } from "@nova-component/ui";
import type { ReactNode } from "react";

import type { SystemStateAction } from "./types.js";

export interface NoResultsStatePresentationProps {
  heading: ReactNode;
  description?: ReactNode;
  action?: SystemStateAction;
  headingLevel?: EmptyStateHeadingLevel;
}

/**
 * "No results" system state — a search/filter returned nothing. Reuses
 * Nova's `EmptyState` (same underlying presentation as "empty") but keeps a
 * distinct Slotnova composition so callers pick the semantically correct
 * one; docs/product-handoff.md keeps "no results" separate from "empty"
 * because the recommended action differs (reset query vs. first action).
 */
export function NoResultsStatePresentation({
  heading,
  description,
  action,
  headingLevel,
}: NoResultsStatePresentationProps) {
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
