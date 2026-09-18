import {
  Button,
  EmptyStatePresentation,
  PermissionRestrictedStatePresentation,
} from "@slotnova/ui";
import { useNavigate } from "react-router";

import { useSession } from "../../app/auth/use-session.js";
import { ROUTES } from "../../app/routes/routes.js";
import styles from "./booking.module.scss";
import { BOOKING_CREATE, hasCapability } from "./capabilities.js";

/**
 * The Booking destination's entry point.
 *
 * Deliberately minimal: PR-08 owns creation and the single-Booking detail
 * surface, while browsing bookings over time is Calendar's job (PR-09).
 * Rather than inventing a booking list nobody has accepted a design for,
 * this route offers the one accepted entry — start a new booking — and
 * says plainly where the rest will live. PR-09 navigates INTO
 * `/bookings/new` and `/bookings/:bookingId` from the Calendar.
 */
export function BookingHomeRoute(): React.JSX.Element {
  const navigate = useNavigate();
  const { activeWorkspace } = useSession();
  const canCreate = hasCapability(activeWorkspace, BOOKING_CREATE);

  return (
    <div className={styles["page"]}>
      <header className={styles["header"]}>
        <div>
          <h1 className={styles["title"]}>Booking</h1>
          <p className={styles["subtitle"]}>Create and manage a single booking.</p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => void navigate(ROUTES.bookingCreate)}>
            New booking
          </Button>
        ) : null}
      </header>

      {canCreate ? (
        <EmptyStatePresentation
          heading="Start a new booking"
          description="Choose a service, pick a start time, check your answers, and confirm. Scheduled bookings appear on the Calendar in a later release."
          headingLevel={2}
          action={{
            label: "New booking",
            onAction: () => void navigate(ROUTES.bookingCreate),
          }}
        />
      ) : (
        <PermissionRestrictedStatePresentation
          heading="You can't create bookings here"
          description="Creating a booking needs the booking:create permission in this workspace. Ask a workspace owner to grant it."
          headingLevel={2}
        />
      )}
    </div>
  );
}
