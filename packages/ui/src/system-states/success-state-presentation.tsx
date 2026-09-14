import { Button, InlineAlert } from "@nova-component/ui";
import type { ReactNode } from "react";

import type { SystemStateAction } from "./types.js";

export interface SuccessStatePresentationProps {
  title: ReactNode;
  children: ReactNode;
  action?: SystemStateAction;
}

/**
 * "Success" system state. Uses Nova's `InlineAlert` with `tone="success"`
 * and a polite announcement, confirming the completed outcome via text and
 * exposing the most useful next action (docs/product-handoff.md).
 */
export function SuccessStatePresentation({
  title,
  children,
  action,
}: SuccessStatePresentationProps) {
  return (
    <InlineAlert
      title={title}
      tone="success"
      announcement="polite"
      action={
        action ? (
          <Button type="button" onClick={action.onAction} disabled={action.disabled}>
            {action.label}
          </Button>
        ) : undefined
      }
    >
      {children}
    </InlineAlert>
  );
}
