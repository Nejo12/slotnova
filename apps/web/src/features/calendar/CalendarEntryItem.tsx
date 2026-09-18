import { Badge, VisuallyHidden, type BadgeTone } from "@slotnova/ui";

import type { CalendarOccupiedStatus } from "./api/types.js";
import styles from "./calendar.module.scss";
import { formatTime, formatTimeRange } from "./day-range.js";
import type { CalendarEntry } from "./entries.js";

/**
 * The Calendar's single stable primitive: one slot of the day, either OPEN
 * or OCCUPIED. Both desktop and mobile render this same item, which is what
 * keeps the two layouts deliberate substitutions of each other rather than
 * two different products.
 *
 * ## Availability never depends on colour
 *
 * Every entry states what it is in WORDS — "Open", "Booked", "Completed" —
 * inside a badge whose tone is only a secondary reinforcement, and spells
 * out its full time range in text. Remove all colour and the calendar still
 * reads correctly (hard product invariant, `docs/product-handoff.md`).
 *
 * ## Semantics, not a fake grid
 *
 * Entries are list items. An interactive one is a real `<button>`, so it is
 * focusable, Enter/Space-activated and announced with a meaningful
 * accessible name for free. Nothing here declares `role="grid"`: a
 * two-dimensional ARIA grid carries a full roving-tabindex keyboard
 * contract, and claiming that role without implementing it is worse than
 * not claiming it. A chronological list of buttons is what this surface
 * actually is.
 *
 * A non-interactive entry (an open slot the operator cannot book, because
 * the workspace has not granted `booking:create`) renders as plain text
 * rather than a disabled button: a control that can never be used is noise
 * in the tab order.
 */
const OCCUPIED_PRESENTATION: Readonly<
  Record<CalendarOccupiedStatus, { label: string; tone: BadgeTone }>
> = {
  confirmed: { label: "Booked", tone: "info" },
  completed: { label: "Completed", tone: "success" },
};

export interface CalendarEntryItemProps {
  entry: CalendarEntry;
  /**
   * The desktop timeline shows a trailing action column; the mobile agenda
   * does not — there the whole row is the touch target and the action is
   * carried by the row's own accessible name. A deliberate layout
   * difference, passed by each layout, not a compression switch.
   */
  showActionHint: boolean;
  /** Occupied entries always navigate; `undefined` is never passed for them. */
  onOpenBooking: (bookingId: string) => void;
  /** Absent when the operator cannot create bookings — the item then renders inert. */
  onStartBooking?: ((startsAtInstant: string) => void) | undefined;
}

export function CalendarEntryItem({
  entry,
  showActionHint,
  onOpenBooking,
  onStartBooking,
}: CalendarEntryItemProps): React.JSX.Element {
  const range = formatTimeRange(entry.start, entry.end);

  if (entry.kind === "occupied") {
    const { label, tone } = OCCUPIED_PRESENTATION[entry.status];
    return (
      <li className={styles["entry-row"]}>
        <button
          type="button"
          className={`${styles["entry"]} ${styles["entry-occupied"]}`}
          onClick={() => onOpenBooking(entry.bookingId)}
        >
          <span className={styles["entry-time"]}>{range}</span>
          <span className={styles["entry-meta"]}>
            <Badge tone={tone}>{label}</Badge>
            <span className={styles["entry-detail"]}>
              Starts {formatTime(entry.startsAt)} &middot; includes buffers
            </span>
          </span>
          {showActionHint ? (
            <span className={styles["entry-action"]}>View booking</span>
          ) : (
            <VisuallyHidden>View booking</VisuallyHidden>
          )}
        </button>
      </li>
    );
  }

  const openBadge = <Badge tone="neutral">Open</Badge>;

  if (onStartBooking === undefined) {
    return (
      <li className={styles["entry-row"]}>
        <div className={`${styles["entry"]} ${styles["entry-open"]} ${styles["entry-inert"]}`}>
          <span className={styles["entry-time"]}>{range}</span>
          <span className={styles["entry-meta"]}>
            {openBadge}
            <span className={styles["entry-detail"]}>Available to book</span>
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className={styles["entry-row"]}>
      <button
        type="button"
        className={`${styles["entry"]} ${styles["entry-open"]}`}
        onClick={() => onStartBooking(entry.start)}
      >
        <span className={styles["entry-time"]}>{range}</span>
        <span className={styles["entry-meta"]}>
          {openBadge}
          <span className={styles["entry-detail"]}>Available to book</span>
        </span>
        {showActionHint ? (
          <span className={styles["entry-action"]}>New booking</span>
        ) : (
          <VisuallyHidden>Start a new booking at this time</VisuallyHidden>
        )}
      </button>
    </li>
  );
}
