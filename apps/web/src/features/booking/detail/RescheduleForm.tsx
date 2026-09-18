import { Button, FormField, TextInput } from "@slotnova/ui";

import styles from "../booking.module.scss";

export const RESCHEDULE_FIELD_ID = "reschedule-starts-at";

export interface RescheduleFormProps {
  value: string;
  error: string | null;
  submitting: boolean;
  serviceName: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const FIELD_ID = RESCHEDULE_FIELD_ID;
const ERROR_ID = "reschedule-starts-at-error";

/**
 * Reschedule moves a confirmed booking to a new time and changes nothing
 * else. The Service is shown read-only on purpose: the API preserves the
 * original Service snapshot exactly ("the Service snapshot is NOT re-read"),
 * so offering a Service change here would promise something the accepted
 * contract cannot do.
 */
export function RescheduleForm({
  value,
  error,
  submitting,
  serviceName,
  onChange,
  onCancel,
  onSubmit,
}: RescheduleFormProps): React.JSX.Element {
  return (
    <section className={styles["panel"]} aria-labelledby="reschedule-heading">
      <h3 id="reschedule-heading" className={styles["step-heading"]}>
        Reschedule this booking
      </h3>

      <p className={styles["note"]}>
        {serviceName} stays the same &mdash; only the start time changes.
      </p>

      <FormField
        label="New start time"
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
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Save new time"}
        </Button>
      </div>
    </section>
  );
}
