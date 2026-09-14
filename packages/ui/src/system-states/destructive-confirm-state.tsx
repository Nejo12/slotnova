import { Dialog } from "@nova-component/ui";
import type { ReactNode } from "react";

import type { SystemStateAction } from "./types.js";

export interface DestructiveConfirmStateProps {
  open: boolean;
  title: ReactNode;
  /** Explicit consequence text — what will happen and what is affected. */
  consequence: ReactNode;
  cancelLabel: string;
  confirmAction: SystemStateAction;
  onClose: () => void;
}

/**
 * "Destructive confirmation" system state. A thin composition over Nova's
 * `Dialog` with `type="destructive"`: focus trap, Escape handling and focus
 * restoration are Nova's own public contract (tested against directly in
 * dialog.test.tsx, not re-proven here). The consequence is always visible
 * text (`destructiveContext`), and cancel is Nova's dialog-level `onClose`
 * so it can never be confused with the destructive action itself —
 * docs/product-handoff.md: "destructive confirmations name the consequence
 * and keep a safe exit visible".
 */
export function DestructiveConfirmState({
  open,
  title,
  consequence,
  cancelLabel,
  confirmAction,
  onClose,
}: DestructiveConfirmStateProps) {
  return (
    <Dialog
      open={open}
      type="destructive"
      title={title}
      cancellable
      cancelLabel={cancelLabel}
      destructiveContext={consequence}
      action={confirmAction}
      onClose={onClose}
    />
  );
}
