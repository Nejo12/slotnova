import {
  Button,
  DestructiveConfirmState,
  EmptyStatePresentation,
  LoadingStatePresentation,
  PermissionRestrictedStatePresentation,
  SuccessStatePresentation,
} from "@slotnova/ui";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

import { useSession } from "../../../app/auth/use-session.js";
import { ROUTES } from "../../../app/routes/routes.js";
import { ApiProblemError } from "../api/problem.js";
import {
  useBooking,
  useCancelBooking,
  useCompleteBooking,
  useRescheduleBooking,
  useService,
} from "../api/queries.js";
import type { Booking } from "../api/types.js";
import { BookingStatusLabel, bookingStatusLabel } from "../BookingStatusLabel.js";
import {
  BOOKING_CANCEL,
  BOOKING_COMPLETE,
  BOOKING_EDIT,
  BOOKING_READ,
  CATALOG_READ,
  hasCapability,
} from "../capabilities.js";
import {
  focusFieldById,
  formatDurationMinutes,
  formatInstant,
  instantToLocalInput,
  localInputToInstant,
} from "../format.js";
import { ProblemAlert } from "../ProblemAlert.js";
import styles from "../booking.module.scss";
import { RESCHEDULE_FIELD_ID, RescheduleForm } from "./RescheduleForm.js";

/**
 * Booking detail (`GET /v1/bookings/:id`) and the actions the accepted
 * Phase-2 surface supports on it: reschedule, cancel and complete.
 *
 * Action visibility is driven by two authoritative inputs only — the
 * booking's own server-returned `status`, and the capability list
 * `GET /v1/me` reports for the active workspace. No role is interpreted,
 * and hiding a control is never treated as enforcement: every command path
 * still renders `forbidden` as a permission state if the server refuses.
 *
 * Terminal states (`cancelled`, `completed`) expose no state-changing
 * action at all, so an invalid transition is not presented as something the
 * operator can attempt in the first place.
 */
export function BookingDetailRoute(): React.JSX.Element {
  const { bookingId = "" } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.id ?? "";

  // The "just created" flag is carried once, in router location state, and
  // then consumed: it is captured into component state on mount and the
  // history entry is rewritten without it, so reloading or returning to
  // this URL later never re-announces a success that did not just happen.
  const [justCreated] = useState(
    () => (location.state as { justCreated?: boolean } | null)?.justCreated === true,
  );

  useEffect(() => {
    if (justCreated) void navigate(location.pathname, { replace: true, state: null });
    // Runs once for the entry that carried the flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreated]);

  const canRead = hasCapability(activeWorkspace, BOOKING_READ);
  const booking = useBooking(workspaceId, bookingId, canRead);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduleFieldError, setRescheduleFieldError] = useState<string | null>(null);

  const reschedule = useRescheduleBooking(workspaceId);
  const cancel = useCancelBooking(workspaceId);
  const complete = useCompleteBooking(workspaceId);

  const serviceId = booking.data?.serviceId;
  const service = useService(
    workspaceId,
    hasCapability(activeWorkspace, CATALOG_READ) ? serviceId : undefined,
  );

  useEffect(() => {
    if (rescheduling) focusFieldById(RESCHEDULE_FIELD_ID);
  }, [rescheduling]);

  if (!canRead) {
    return (
      <PermissionRestrictedStatePresentation
        heading="You can't view this booking"
        description="Viewing a booking needs the booking:read permission in this workspace. Ask a workspace owner to grant it."
        action={{ label: "Back to Booking", onAction: () => void navigate(ROUTES.booking) }}
      />
    );
  }

  if (booking.isPending) {
    return <LoadingStatePresentation label="Loading this booking" rows={5} rowHeight="1.5rem" />;
  }

  if (booking.isError) {
    return (
      <BookingLoadError
        error={booking.error}
        onRetry={() => void booking.refetch()}
        onBack={() => void navigate(ROUTES.booking)}
      />
    );
  }

  const record = booking.data;
  const serviceName = service.data?.name ?? null;
  const confirmed = record.status === "confirmed";

  function startReschedule(current: Booking): void {
    reschedule.reset();
    setRescheduleFieldError(null);
    setRescheduleValue(instantToLocalInput(current.startsAt));
    setRescheduling(true);
  }

  function submitReschedule(current: Booking): void {
    const instant = localInputToInstant(rescheduleValue);
    if (instant === null) {
      setRescheduleFieldError("Enter the new date and time for this booking.");
      focusFieldById(RESCHEDULE_FIELD_ID);
      return;
    }
    setRescheduleFieldError(null);
    reschedule.mutate(
      { id: current.id, version: current.version, startsAt: instant },
      {
        onSuccess: () => {
          setRescheduling(false);
        },
        onError: (error) => {
          // The booking is no longer confirmed: the form itself is now
          // meaningless, so close it and let the refreshed record speak.
          if (error instanceof ApiProblemError && error.kind === "invalid-transition") {
            setRescheduling(false);
          }
        },
      },
    );
  }

  function confirmCancel(current: Booking): void {
    setConfirmingCancel(false);
    cancel.mutate({ id: current.id, version: current.version });
  }

  return (
    <div className={styles["page"]}>
      <header className={styles["header"]}>
        <div>
          <h1 className={styles["title"]}>Booking</h1>
          <p className={styles["subtitle"]}>{serviceName ?? "Service details unavailable"}</p>
        </div>
        <BookingStatusLabel status={record.status} />
      </header>

      {justCreated && record.status === "confirmed" ? (
        <SuccessStatePresentation title="Booking confirmed">
          This booking is confirmed and the time is now held.
        </SuccessStatePresentation>
      ) : null}

      {cancel.isSuccess && record.status === "cancelled" ? (
        <SuccessStatePresentation title="Booking cancelled">
          The time this booking occupied has been released.
        </SuccessStatePresentation>
      ) : null}

      {complete.isSuccess && record.status === "completed" ? (
        <SuccessStatePresentation title="Booking completed">
          This booking is kept as a historical record.
        </SuccessStatePresentation>
      ) : null}

      {reschedule.isError ? (
        <CommandErrorAlert error={reschedule.error} verb="rescheduled" />
      ) : null}
      {cancel.isError ? <CommandErrorAlert error={cancel.error} verb="cancelled" /> : null}
      {complete.isError ? <CommandErrorAlert error={complete.error} verb="completed" /> : null}

      <section className={styles["panel"]} aria-labelledby="booking-details-heading">
        <h2 id="booking-details-heading" className={styles["step-heading"]}>
          Details
        </h2>
        <dl className={styles["summary-list"]}>
          <dt className={styles["summary-term"]}>Status</dt>
          <dd className={styles["summary-value"]}>{bookingStatusLabel(record.status)}</dd>

          <dt className={styles["summary-term"]}>Service</dt>
          <dd className={styles["summary-value"]}>{serviceName ?? "Unavailable"}</dd>

          <dt className={styles["summary-term"]}>Starts at</dt>
          <dd className={styles["summary-value"]}>{formatInstant(record.startsAt)}</dd>

          <dt className={styles["summary-term"]}>Duration</dt>
          <dd className={styles["summary-value"]}>
            {formatDurationMinutes(record.serviceDurationMinutes)}
          </dd>

          <dt className={styles["summary-term"]}>Time held</dt>
          <dd className={styles["summary-value"]}>
            {formatInstant(record.blockingRange.start)} to {formatInstant(record.blockingRange.end)}
          </dd>
        </dl>
        {record.preBufferMinutes > 0 || record.postBufferMinutes > 0 ? (
          <p className={styles["note"]}>
            Includes {formatDurationMinutes(record.preBufferMinutes)} before and{" "}
            {formatDurationMinutes(record.postBufferMinutes)} after the service.
          </p>
        ) : null}
      </section>

      {rescheduling && confirmed ? (
        <RescheduleForm
          value={rescheduleValue}
          error={rescheduleFieldError}
          submitting={reschedule.isPending}
          serviceName={serviceName ?? "This service"}
          onChange={(value) => {
            setRescheduleValue(value);
            setRescheduleFieldError(null);
          }}
          onCancel={() => setRescheduling(false)}
          onSubmit={() => submitReschedule(record)}
        />
      ) : null}

      {confirmed ? (
        <div className={styles["actions"]}>
          {hasCapability(activeWorkspace, BOOKING_EDIT) && !rescheduling ? (
            <Button type="button" variant="secondary" onClick={() => startReschedule(record)}>
              Reschedule
            </Button>
          ) : null}
          {hasCapability(activeWorkspace, BOOKING_COMPLETE) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={complete.isPending}
              onClick={() => complete.mutate({ id: record.id, version: record.version })}
            >
              Mark completed
            </Button>
          ) : null}
          {hasCapability(activeWorkspace, BOOKING_CANCEL) ? (
            <Button type="button" variant="danger" onClick={() => setConfirmingCancel(true)}>
              Cancel booking
            </Button>
          ) : null}
        </div>
      ) : (
        <p className={styles["note"]}>
          {record.status === "cancelled"
            ? "Cancelled bookings can't be changed. Create a new booking instead."
            : "Completed bookings are kept as a historical record and can't be changed."}
        </p>
      )}

      <DestructiveConfirmState
        open={confirmingCancel}
        title="Cancel this booking?"
        consequence={`${serviceName ?? "This booking"} on ${formatInstant(record.startsAt)} will be cancelled and its time released. This can't be undone.`}
        cancelLabel="Keep booking"
        confirmAction={{ label: "Cancel booking", onAction: () => confirmCancel(record) }}
        onClose={() => setConfirmingCancel(false)}
      />
    </div>
  );
}

function BookingLoadError({
  error,
  onRetry,
  onBack,
}: {
  error: Error;
  onRetry: () => void;
  onBack: () => void;
}): React.JSX.Element {
  if (error instanceof ApiProblemError && error.kind === "forbidden") {
    return (
      <PermissionRestrictedStatePresentation
        heading="You can't view this booking"
        description="Viewing a booking needs the booking:read permission in this workspace."
        action={{ label: "Back to Booking", onAction: onBack }}
      />
    );
  }
  if (error instanceof ApiProblemError && error.kind === "not-found") {
    return (
      <EmptyStatePresentation
        heading="This booking doesn't exist"
        description="It may have been removed, or it belongs to a different workspace."
        action={{ label: "Back to Booking", onAction: onBack }}
      />
    );
  }
  return (
    <ProblemAlert
      title="This booking couldn't be loaded"
      action={{ label: "Try again", onAction: onRetry }}
    >
      Something went wrong while loading this booking.
    </ProblemAlert>
  );
}

/**
 * Command-failure vocabulary shared by reschedule/cancel/complete. Each
 * conflict class the contract distinguishes gets its own explanation and
 * its own next step — a stale write is never silently retried over, and an
 * illegal transition is never shown as a generic "something went wrong".
 */
function CommandErrorAlert({ error, verb }: { error: Error; verb: string }): React.JSX.Element {
  const kind = error instanceof ApiProblemError ? error.kind : "unknown";

  switch (kind) {
    case "booking-overlap":
      return (
        <ProblemAlert title="That time is already booked">
          Another booking already occupies the new window, including its buffers. Choose a different
          start time.
        </ProblemAlert>
      );
    case "stale-write":
      return (
        <ProblemAlert title="This booking changed since you opened it">
          Nothing was overwritten. The latest version has been reloaded above &mdash; check it and
          try again if you still want to continue.
        </ProblemAlert>
      );
    case "invalid-transition":
      return (
        <ProblemAlert title={`This booking can no longer be ${verb}`}>
          Its status has moved on since you opened it. The current state is shown above.
        </ProblemAlert>
      );
    case "forbidden":
      return (
        <ProblemAlert title="You don't have permission for that">
          This action needs a permission you don&rsquo;t have in this workspace.
        </ProblemAlert>
      );
    case "session-invalid":
      return <ProblemAlert title="Your session has ended">Sign in again to continue.</ProblemAlert>;
    default:
      return (
        <ProblemAlert title={`This booking couldn't be ${verb}`}>
          Something went wrong. Nothing was changed &mdash; try again.
        </ProblemAlert>
      );
  }
}
