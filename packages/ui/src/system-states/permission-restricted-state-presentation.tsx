import { Button, EmptyState, type EmptyStateHeadingLevel } from "@nova-component/ui";
import type { ReactNode } from "react";

import type { SystemStateAction } from "./types.js";

export interface PermissionRestrictedStatePresentationProps {
  heading: ReactNode;
  /** Explains what the operator cannot do and which permission/role is required. */
  description: ReactNode;
  /** A safe way out (e.g. "Back", "Request access") — never the restricted action itself. */
  action?: SystemStateAction;
  headingLevel?: EmptyStateHeadingLevel;
}

/**
 * "Permission restricted" system state. Composed over Nova's `EmptyState`
 * so the missing capability is explained via text (heading + description),
 * never inferred from a hidden/disabled control alone —
 * docs/product-handoff.md / FR-031: UI permission state mirrors but never
 * replaces server-side enforcement, and this presentation is purely the
 * mirror, not the enforcement itself.
 */
export function PermissionRestrictedStatePresentation({
  heading,
  description,
  action,
  headingLevel,
}: PermissionRestrictedStatePresentationProps) {
  return (
    <EmptyState
      heading={heading}
      description={description}
      {...(headingLevel !== undefined ? { headingLevel } : {})}
      action={
        action ? (
          <Button
            type="button"
            variant="secondary"
            onClick={action.onAction}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ) : undefined
      }
    />
  );
}
