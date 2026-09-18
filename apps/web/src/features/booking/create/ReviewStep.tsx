import { Button } from "@slotnova/ui";

import styles from "../booking.module.scss";
import { formatDurationMinutes, formatInstant } from "../format.js";
import type { ServiceListItem } from "../api/types.js";

export interface ReviewStepProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  service: ServiceListItem;
  startsAtInstant: string;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

/**
 * Step 3 — compact check-answers before a high-consequence action
 * (docs/product-handoff.md, "compact review/check-answers for
 * high-consequence actions").
 *
 * It shows exactly what will be sent: the Service and the start instant.
 * No client/customer, staff, resource or location data appears, because
 * none exists in the Phase-2 Booking model (FR-029). Nothing has been
 * reserved at this point — no capacity is held, and no draft exists
 * anywhere but in this component tree — so the copy never implies one.
 */
export function ReviewStep({
  headingRef,
  service,
  startsAtInstant,
  submitting,
  onBack,
  onSubmit,
}: ReviewStepProps): React.JSX.Element {
  return (
    <section className={styles["panel"]} aria-labelledby="booking-step-review">
      <h2
        id="booking-step-review"
        className={styles["step-heading"]}
        tabIndex={-1}
        ref={headingRef}
      >
        Check your answers
      </h2>

      <dl className={styles["summary-list"]}>
        <dt className={styles["summary-term"]}>Service</dt>
        <dd className={styles["summary-value"]}>{service.name}</dd>

        <dt className={styles["summary-term"]}>Duration</dt>
        <dd className={styles["summary-value"]}>
          {formatDurationMinutes(service.durationMinutes)}
        </dd>

        <dt className={styles["summary-term"]}>Starts at</dt>
        <dd className={styles["summary-value"]}>{formatInstant(startsAtInstant)}</dd>
      </dl>

      <p className={styles["note"]}>
        Nothing is reserved yet. The time is held only once you confirm.
      </p>

      <div className={`${styles["actions"]} ${styles["actions-end"]}`}>
        <Button type="button" variant="secondary" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Confirming…" : "Confirm booking"}
        </Button>
      </div>
    </section>
  );
}
