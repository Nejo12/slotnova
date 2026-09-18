import {
  Button,
  EmptyStatePresentation,
  Fieldset,
  LoadingStatePresentation,
  Radio,
} from "@slotnova/ui";

import styles from "../booking.module.scss";
import { formatDurationMinutes } from "../format.js";
import type { ServiceListItem } from "../api/types.js";

export interface ServiceStepProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  services: readonly ServiceListItem[] | undefined;
  truncated: boolean;
  isPending: boolean;
  selectedServiceId: string | null;
  onSelect: (serviceId: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * Step 1 — choose a Service. Only ACTIVE Services are offered: the request
 * asks the Catalog API for `active=true` and the client filters again, so
 * an inactive Service is never presented as an ordinary selectable option
 * (the server would reject one with `validation` anyway).
 *
 * This is a Service picker, not Catalog management: nothing here creates,
 * edits, activates or deactivates a Service.
 */
export function ServiceStep({
  headingRef,
  services,
  truncated,
  isPending,
  selectedServiceId,
  onSelect,
  onContinue,
  onCancel,
}: ServiceStepProps): React.JSX.Element {
  if (isPending) {
    return (
      <section className={styles["panel"]} aria-labelledby="booking-step-service">
        <h2
          id="booking-step-service"
          className={styles["step-heading"]}
          tabIndex={-1}
          ref={headingRef}
        >
          Choose a service
        </h2>
        <LoadingStatePresentation label="Loading services" rows={4} rowHeight="2.5rem" />
      </section>
    );
  }

  const items = services ?? [];

  return (
    <section className={styles["panel"]} aria-labelledby="booking-step-service">
      <h2
        id="booking-step-service"
        className={styles["step-heading"]}
        tabIndex={-1}
        ref={headingRef}
      >
        Choose a service
      </h2>

      {items.length === 0 ? (
        <EmptyStatePresentation
          heading="No active services yet"
          description="A booking needs an active service. Ask a workspace owner to add one, then start again."
          headingLevel={3}
        />
      ) : (
        <>
          <Fieldset legend="Service" description="Pick the service this booking is for.">
            <ul className={styles["options"]}>
              {items.map((service) => (
                <li
                  key={service.id}
                  className={[
                    styles["option"],
                    service.id === selectedServiceId ? styles["option-selected"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Radio
                    name="booking-service"
                    value={service.id}
                    checked={service.id === selectedServiceId}
                    onChange={() => onSelect(service.id)}
                    label={service.name}
                    description={formatDurationMinutes(service.durationMinutes)}
                  />
                </li>
              ))}
            </ul>
          </Fieldset>
          {truncated ? (
            <p className={styles["note"]}>
              Only the first {items.length} active services are listed here.
            </p>
          ) : null}
        </>
      )}

      <div className={`${styles["actions"]} ${styles["actions-end"]}`}>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onContinue} disabled={selectedServiceId === null}>
          Continue to time
        </Button>
      </div>
    </section>
  );
}
