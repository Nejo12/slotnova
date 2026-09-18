import { PermissionRestrictedStatePresentation } from "@slotnova/ui";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useSession } from "../../../app/auth/use-session.js";
import { ROUTES, bookingDetailPath } from "../../../app/routes/routes.js";
import { ApiProblemError } from "../api/problem.js";
import { useActiveServices, useCreateBooking } from "../api/queries.js";
import { BOOKING_CREATE, CATALOG_READ, hasCapability } from "../capabilities.js";
import { focusFieldById, instantToLocalInput, localInputToInstant } from "../format.js";
import { ProblemAlert } from "../ProblemAlert.js";
import styles from "../booking.module.scss";
import { ReviewStep } from "./ReviewStep.js";
import { ServiceStep } from "./ServiceStep.js";
import { TIME_FIELD_ID, TimeStep } from "./TimeStep.js";
import { keyForIntent, randomSubmissionKey, type SubmissionKey } from "./submission-key.js";

type Step = "service" | "time" | "review";

const STEP_ORDER: readonly Step[] = ["service", "time", "review"];

/**
 * Booking creation (PR-08).
 *
 * ## Flow state is entirely client-side
 * "Draft" and "Review" are steps of THIS component, not server states. The
 * Phase-2 Booking lifecycle is `confirmed | completed | cancelled` — there
 * is no persisted draft, no pending, and no `/confirm` step, so nothing is
 * written anywhere until the operator presses Confirm. Leaving or
 * cancelling an unfinished flow therefore creates no Booking by
 * construction: there is nothing to clean up.
 *
 * The selected Service and start time live in this component's state, so
 * they survive Back and every recoverable failure — the failure paths below
 * only ever change which step is shown and which alert is rendered, never
 * the selections themselves.
 *
 * ## Optional start-time prefill (PR-09)
 * `/bookings/new?startsAt=<instant>` prefills the time field when the
 * operator arrives from an open Calendar slot. It is a pure convenience:
 * nothing is reserved or persisted by arriving with it, the flow still
 * starts at the Service step and still validates and submits exactly what
 * the operator confirms, and an absent/malformed value is IGNORED so the
 * field simply starts empty. The Calendar owns no draft state here — it
 * wrote a URL, and this component read it once.
 *
 * ## Idempotency key
 * See `./submission-key.ts`. The key is held in a ref keyed by the intent
 * signature: the same intent (a transport retry, a "Try again") reuses it;
 * editing the Service or time mints a new one on the next attempt.
 */
export function CreateBookingRoute(): React.JSX.Element {
  const navigate = useNavigate();
  const { activeWorkspace } = useSession();
  const workspaceId = activeWorkspace?.id ?? "";

  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  // Read ONCE, as the initial value only: the operator's subsequent edits
  // are never overwritten by the URL, and a stale link cannot fight them.
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    prefilledLocalTime(searchParams.get("startsAt")),
  );
  const [timeError, setTimeError] = useState<string | null>(null);

  const submissionKey = useRef<SubmissionKey | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedStep = useRef<Step | null>(null);

  const canCreate =
    hasCapability(activeWorkspace, BOOKING_CREATE) && hasCapability(activeWorkspace, CATALOG_READ);

  // Gated on the authoritative session capabilities so a restricted
  // operator never even issues a request the server would refuse. This is
  // an affordance, not enforcement — the 403 path below still renders.
  const services = useActiveServices(workspaceId, canCreate);
  const create = useCreateBooking(workspaceId);

  // Move focus to the step heading whenever the step CHANGES, so a keyboard
  // or screen-reader user is placed at the start of the new step instead of
  // on a button that no longer exists. Arriving at the route does not steal
  // focus from the document start. Written as "focus once per step we have
  // not focused yet" rather than "skip the first run" so React's
  // double-invoked effects in development cannot focus the initial step.
  useEffect(() => {
    const previous = focusedStep.current;
    focusedStep.current = step;
    if (previous !== null && previous !== step) headingRef.current?.focus();
  }, [step]);

  if (activeWorkspace === null || activeWorkspace === undefined || !canCreate) {
    return (
      <PermissionRestrictedStatePresentation
        heading="You can't create bookings here"
        description="Creating a booking needs the booking:create and catalog:read permissions in this workspace. Ask a workspace owner to grant them."
        action={{ label: "Back to Booking", onAction: () => void navigate(ROUTES.booking) }}
      />
    );
  }

  const selectedService = services.data?.items.find((item) => item.id === serviceId);
  const startsAtInstant = localInputToInstant(startsAtLocal);

  function goToStep(next: Step): void {
    create.reset();
    setStep(next);
  }

  function continueFromTime(): void {
    if (startsAtInstant === null) {
      setTimeError("Enter the date and time this booking starts.");
      focusFieldById(TIME_FIELD_ID);
      return;
    }
    setTimeError(null);
    goToStep("review");
  }

  function submit(): void {
    if (selectedService === undefined || startsAtInstant === null) return;
    const intent = { serviceId: selectedService.id, startsAt: startsAtInstant };
    const next = keyForIntent(submissionKey.current, intent, randomSubmissionKey);
    submissionKey.current = next;

    create.mutate(
      { ...intent, idempotencyKey: next.key },
      {
        onSuccess: (booking) => {
          void navigate(bookingDetailPath(booking.id), { state: { justCreated: true } });
        },
        onError: (error) => {
          // A key replayed with a different body is the one failure this
          // surface cannot recover by retrying the same key: drop it so the
          // next attempt is a clean new submission.
          if (error instanceof ApiProblemError && error.kind === "idempotency-conflict") {
            submissionKey.current = null;
          }
        },
      },
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step) + 1;

  return (
    <div className={styles["page"]}>
      <header className={styles["header"]}>
        <div>
          <h1 className={styles["title"]}>New booking</h1>
          <p className={styles["subtitle"]}>
            Step {stepIndex} of {STEP_ORDER.length}
          </p>
        </div>
      </header>

      {services.isError && step === "service" ? (
        <ServicesErrorAlert error={services.error} onRetry={() => void services.refetch()} />
      ) : null}

      {create.isError ? (
        <CreateErrorAlert
          error={create.error}
          onChooseAnotherTime={() => goToStep("time")}
          onRetry={submit}
        />
      ) : null}

      {step === "service" && !services.isError ? (
        <ServiceStep
          headingRef={headingRef}
          services={services.data?.items}
          truncated={services.data?.truncated ?? false}
          isPending={services.isPending}
          selectedServiceId={serviceId}
          onSelect={setServiceId}
          onContinue={() => {
            if (serviceId !== null) goToStep("time");
          }}
          onCancel={() => void navigate(ROUTES.booking)}
        />
      ) : null}

      {step === "time" ? (
        <TimeStep
          headingRef={headingRef}
          value={startsAtLocal}
          error={timeError}
          onChange={(value) => {
            setStartsAtLocal(value);
            setTimeError(null);
          }}
          onBack={() => goToStep("service")}
          onContinue={continueFromTime}
        />
      ) : null}

      {step === "review" && selectedService !== undefined && startsAtInstant !== null ? (
        <ReviewStep
          headingRef={headingRef}
          service={selectedService}
          startsAtInstant={startsAtInstant}
          submitting={create.isPending}
          onBack={() => goToStep("time")}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}

/**
 * `?startsAt=<ISO-8601 instant>` -> a `datetime-local` value, or `""` when
 * the parameter is absent or not a real instant. Degrading to an empty
 * field is deliberate: a bad link must produce a usable form, never an
 * error state or an `Invalid Date` in the control.
 */
function prefilledLocalTime(raw: string | null): string {
  if (raw === null || raw.trim() === "") return "";
  const local = instantToLocalInput(raw);
  // `instantToLocalInput` already returns "" for an unparseable instant.
  return local;
}

function ServicesErrorAlert({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}): React.JSX.Element {
  if (error instanceof ApiProblemError && error.kind === "forbidden") {
    return (
      <ProblemAlert title="You can't view services here">
        Choosing a service needs the catalog:read permission in this workspace.
      </ProblemAlert>
    );
  }
  if (error instanceof ApiProblemError && error.kind === "session-invalid") {
    return (
      <ProblemAlert title="Your session has ended">
        Sign in again to continue creating this booking.
      </ProblemAlert>
    );
  }
  return (
    <ProblemAlert
      title="Services couldn't be loaded"
      action={{ label: "Try again", onAction: onRetry }}
    >
      Something went wrong while loading this workspace&rsquo;s services.
    </ProblemAlert>
  );
}

/**
 * The create-failure vocabulary. Each branch reads the contract's `type`
 * slug only, and NONE of them clears the operator's selections — they stay
 * exactly as entered so the flow can be resumed or corrected.
 */
function CreateErrorAlert({
  error,
  onChooseAnotherTime,
  onRetry,
}: {
  error: Error;
  onChooseAnotherTime: () => void;
  onRetry: () => void;
}): React.JSX.Element {
  const kind = error instanceof ApiProblemError ? error.kind : "unknown";

  switch (kind) {
    case "booking-overlap":
      return (
        <ProblemAlert
          title="That time is already booked"
          action={{ label: "Choose another time", onAction: onChooseAnotherTime }}
        >
          Another booking already occupies this window, including its buffers. Your service is still
          selected &mdash; pick a different start time and review again.
        </ProblemAlert>
      );
    case "validation":
      return (
        <ProblemAlert
          title="This booking couldn't be created"
          action={{ label: "Choose another time", onAction: onChooseAnotherTime }}
        >
          The service or start time wasn&rsquo;t accepted &mdash; the service may no longer be
          active. Your answers are kept; change them and review again.
        </ProblemAlert>
      );
    case "forbidden":
      return (
        <ProblemAlert title="You can't create this booking">
          Creating a booking needs the booking:create permission in this workspace.
        </ProblemAlert>
      );
    case "session-invalid":
      return (
        <ProblemAlert title="Your session has ended">
          Sign in again. Your answers are still here.
        </ProblemAlert>
      );
    case "idempotency-conflict":
      return (
        <ProblemAlert
          title="This booking couldn't be confirmed"
          action={{ label: "Try again", onAction: onRetry }}
        >
          A previous attempt is still being resolved. Try confirming once more.
        </ProblemAlert>
      );
    default:
      return (
        <ProblemAlert
          title="This booking couldn't be confirmed"
          action={{ label: "Try again", onAction: onRetry }}
        >
          Something went wrong on the way to the server. Your answers are kept &mdash; trying again
          will not create a duplicate booking.
        </ProblemAlert>
      );
  }
}
