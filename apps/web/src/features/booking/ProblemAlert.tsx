import { ErrorStatePresentation, type SystemStateAction } from "@slotnova/ui";
import { useEffect, useRef, type ReactNode } from "react";

import styles from "./booking.module.scss";

export interface ProblemAlertProps {
  title: string;
  children: ReactNode;
  action?: SystemStateAction;
}

/**
 * A failed/conflicting operation's feedback. Two things matter here beyond
 * the shared error presentation:
 *
 * 1. focus moves to the alert when it appears, so a keyboard or screen
 *    reader user lands on the explanation instead of being left wherever
 *    the submit button used to be. The wrapper is `tabIndex={-1}` — it is
 *    programmatically focusable but NOT in the tab order, and nothing is
 *    trapped: Tab continues straight into the form the operator must fix.
 * 2. the shared presentation already announces assertively and carries the
 *    failure in text + Nova's tone mark, never colour alone.
 */
export function ProblemAlert({ title, children, action }: ProblemAlertProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [title]);

  return (
    <div ref={ref} tabIndex={-1} className={styles["alert-region"]}>
      <ErrorStatePresentation title={title} {...(action ? { action } : {})}>
        {children}
      </ErrorStatePresentation>
    </div>
  );
}
