import { Button, InlineAlert } from "@nova-component/ui";
import type { ReactNode } from "react";

import type { SystemStateAction } from "./types.js";

export interface ErrorStatePresentationProps {
  title: ReactNode;
  children: ReactNode;
  action?: SystemStateAction;
}

/**
 * "Error" system state. Uses Nova's `InlineAlert` with `tone="error"` and
 * `announcement="assertive"` so screen readers are interrupted for a failed
 * operation (InlineAlert defaults to no live-region role otherwise). Status
 * is communicated by the title/body text and Nova's own tone icon — never
 * color alone. The optional retry action preserves a way forward.
 */
export function ErrorStatePresentation({ title, children, action }: ErrorStatePresentationProps) {
  return (
    <InlineAlert
      title={title}
      tone="error"
      announcement="assertive"
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
    >
      {children}
    </InlineAlert>
  );
}
