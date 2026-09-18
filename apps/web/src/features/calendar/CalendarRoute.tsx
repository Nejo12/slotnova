import {
  Button,
  ErrorStatePresentation,
  EmptyStatePresentation,
  LoadingStatePresentation,
  PermissionRestrictedStatePresentation,
} from "@slotnova/ui";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useSession } from "../../app/auth/use-session.js";
import { bookingCreatePath, bookingDetailPath } from "../../app/routes/routes.js";
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from "../../app/shell/use-media-query.js";
import { ApiProblemError } from "./api/problem.js";
import { useCalendar } from "./api/queries.js";
import { CalendarAgenda } from "./CalendarAgenda.js";
import { CalendarTimeline } from "./CalendarTimeline.js";
import styles from "./calendar.module.scss";
import { BOOKING_CREATE, canReadCalendar, hasCapability } from "./capabilities.js";
import { dayRangeOf, formatDayHeading, shiftDay, todayKey } from "./day-range.js";
import { isEmptyView, toCalendarEntries } from "./entries.js";

/** The one search parameter this route reads. Deep-linkable and bounded. */
const DAY_PARAM = "day";

/**
 * The Calendar destination (`/calendar`), replacing the Phase-1 placeholder.
 *
 * ## What it is
 *
 * A READ of one bounded day, composed server-side by `GET /v1/calendar`
 * (Scheduling's resolved availability + Booking's occupancy). The browser
 * merges nothing, computes no availability and re-implements no recurrence,
 * DST or overlap rule — it renders one payload and navigates.
 *
 * ## Which day
 *
 * The visible day lives in the URL (`?day=YYYY-MM-DD`), so a Calendar view
 * is shareable, reloadable and back/forward-navigable, and it is the only
 * range input: there is no free-form date entry and no unbounded window.
 * An absent or unparseable value degrades to today (`day-range.ts`).
 *
 * ## States (FR-032)
 *
 * Loading, permission-restricted, error+retry and empty are each an
 * explicit, distinct presentation — never a blank grid. Permission-
 * restricted is checked twice on purpose: once against the authoritative
 * `GET /v1/me` capability list so a restricted operator never issues a
 * request the server would refuse, and once against an actual `forbidden`
 * problem, so a capability revoked mid-session still lands on the
 * permission state and never on "no bookings".
 */
export function CalendarRoute(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT_QUERY);
  const { activeWorkspace } = useSession();

  const workspaceId = activeWorkspace?.id ?? "";
  const canRead = canReadCalendar(activeWorkspace);
  const canCreate = hasCapability(activeWorkspace, BOOKING_CREATE);

  const day = dayRangeOf(searchParams.get(DAY_PARAM) ?? todayKey()).day;
  const range = useMemo(() => dayRangeOf(day), [day]);

  const calendar = useCalendar(
    workspaceId,
    { from: range.from, to: range.to },
    canRead && workspaceId !== "",
  );

  function goToDay(next: string): void {
    // `replace: false` keeps Back working through the days the operator
    // stepped through, which is the behaviour a date pager should have.
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set(DAY_PARAM, next);
      return params;
    });
  }

  const heading = formatDayHeading(day);
  const isToday = day === todayKey();

  return (
    <div className={styles["page"]}>
      <header className={styles["header"]}>
        <div>
          <h1 className={styles["title"]}>Calendar</h1>
          <p className={styles["subtitle"]}>Open time and bookings for one day.</p>
        </div>
      </header>

      <nav className={styles["daynav"]} aria-label="Calendar day navigation">
        <Button
          type="button"
          variant="secondary"
          onClick={() => goToDay(shiftDay(day, -1))}
          aria-label="Previous day"
        >
          Previous day
        </Button>
        <h2 className={styles["day-heading"]} aria-live="polite">
          {heading}
        </h2>
        <div className={styles["daynav-forward"]}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => goToDay(todayKey())}
            disabled={isToday}
            aria-label="Go to today"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => goToDay(shiftDay(day, 1))}
            aria-label="Next day"
          >
            Next day
          </Button>
        </div>
      </nav>

      <CalendarBody
        canRead={canRead}
        canCreate={canCreate}
        isMobile={isMobile}
        state={calendar}
        onRetry={() => void calendar.refetch()}
        onOpenBooking={(bookingId) => void navigate(bookingDetailPath(bookingId))}
        onStartBooking={(startsAtInstant) =>
          void navigate(bookingCreatePath({ startsAt: startsAtInstant }))
        }
      />
    </div>
  );
}

interface CalendarBodyProps {
  canRead: boolean;
  canCreate: boolean;
  isMobile: boolean;
  state: ReturnType<typeof useCalendar>;
  onRetry: () => void;
  onOpenBooking: (bookingId: string) => void;
  onStartBooking: (startsAtInstant: string) => void;
}

function CalendarBody({
  canRead,
  canCreate,
  isMobile,
  state,
  onRetry,
  onOpenBooking,
  onStartBooking,
}: CalendarBodyProps): React.JSX.Element {
  const restricted =
    !canRead || (state.error instanceof ApiProblemError && isForbidden(state.error));

  if (restricted) {
    return (
      <PermissionRestrictedStatePresentation
        heading="You can't view this calendar"
        description="The calendar combines availability and bookings, so it needs both the booking:read and scheduling:read permissions in this workspace. Ask a workspace owner to grant them."
        headingLevel={3}
      />
    );
  }

  if (state.isPending) {
    return <LoadingStatePresentation label="Loading this day's calendar" />;
  }

  if (state.isError) {
    return (
      <ErrorStatePresentation
        title={errorTitle(state.error)}
        action={{ label: "Try again", onAction: onRetry }}
      >
        {errorBody(state.error)}
      </ErrorStatePresentation>
    );
  }

  if (isEmptyView(state.data)) {
    return (
      <EmptyStatePresentation
        heading="Nothing scheduled for this day"
        description="There is no open time and no booking on this day. Check another day, or set working hours in Scheduling."
        headingLevel={3}
      />
    );
  }

  const entries = toCalendarEntries(state.data);
  const summary = summarise(state.data.open.length, state.data.occupied.length);
  const layoutProps = {
    entries,
    summary,
    onOpenBooking,
    ...(canCreate ? { onStartBooking } : {}),
  };

  // Deliberate substitution decided at render time, exactly as
  // `ShellLayout` picks Desktop or Mobile — not a CSS-only compression.
  return isMobile ? <CalendarAgenda {...layoutProps} /> : <CalendarTimeline {...layoutProps} />;
}

function isForbidden(error: ApiProblemError): boolean {
  return error.kind === "forbidden";
}

function errorTitle(error: Error): string {
  if (error instanceof ApiProblemError && error.kind === "session-invalid") {
    return "Your session has ended";
  }
  if (error instanceof ApiProblemError && error.kind === "validation") {
    return "That day couldn't be shown";
  }
  return "This calendar couldn't be loaded";
}

function errorBody(error: Error): string {
  if (error instanceof ApiProblemError && error.kind === "session-invalid") {
    return "Sign in again to see this day's calendar.";
  }
  if (error instanceof ApiProblemError && error.kind === "validation") {
    return "The requested day is outside the range the calendar can show. Choose a nearer day.";
  }
  return "Something went wrong while loading availability and bookings for this day. Nothing was changed.";
}

/** Plain-language day summary. Counts in words, never conveyed by colour. */
function summarise(openCount: number, occupiedCount: number): string {
  const open =
    openCount === 0
      ? "No open time"
      : `${String(openCount)} open ${openCount === 1 ? "period" : "periods"}`;
  const booked =
    occupiedCount === 0
      ? "no bookings"
      : `${String(occupiedCount)} ${occupiedCount === 1 ? "booking" : "bookings"}`;
  return `${open} and ${booked} on this day.`;
}
