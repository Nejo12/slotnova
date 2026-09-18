import { Button, FormField, TextInput } from "@slotnova/ui";

import styles from "../booking.module.scss";

export const TIME_FIELD_ID = "booking-starts-at";

export interface TimeStepProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

const FIELD_ID = TIME_FIELD_ID;
const ERROR_ID = "booking-starts-at-error";

/**
 * Step 2 — choose when the booking starts.
 *
 * A bounded local date/time field, deliberately: Phase-2 Scheduling exposes
 * a pure availability RESOLVER (`POST /v1/scheduling/availability/resolve`)
 * that returns UTC instant intervals, but nothing in the accepted Phase-2
 * surface exposes the workspace's own timezone to the browser, so rendering
 * those intervals as operator-facing "slots" would mean inventing a
 * timezone presentation rule and re-deriving slot boundaries client-side.
 * The contract's own model is followed instead: the browser submits ONE
 * instant, and the server owns recurrence, DST, buffers and overlap. Slot
 * presentation belongs with the Calendar surface (PR-09).
 */
export function TimeStep({
  headingRef,
  value,
  error,
  onChange,
  onBack,
  onContinue,
}: TimeStepProps): React.JSX.Element {
  return (
    <section className={styles["panel"]} aria-labelledby="booking-step-time">
      <h2 id="booking-step-time" className={styles["step-heading"]} tabIndex={-1} ref={headingRef}>
        Choose a start time
      </h2>

      <FormField
        label="Starts at"
        htmlFor={FIELD_ID}
        description="Date and time in your local time zone."
        required
        {...(error !== null ? { error: <span id={ERROR_ID}>{error}</span> } : {})}
      >
        <TextInput
          id={FIELD_ID}
          type="datetime-local"
          value={value}
          required
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? ERROR_ID : undefined}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        />
      </FormField>

      <div className={`${styles["actions"]} ${styles["actions-end"]}`}>
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue to review
        </Button>
      </div>
    </section>
  );
}
