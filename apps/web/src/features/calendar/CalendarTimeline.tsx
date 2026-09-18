import { CalendarEntryItem } from "./CalendarEntryItem.js";
import styles from "./calendar.module.scss";
import type { CalendarEntry } from "./entries.js";

export interface CalendarLayoutProps {
  entries: readonly CalendarEntry[];
  /** Plain-language summary of the day, announced and displayed. */
  summary: string;
  onOpenBooking: (bookingId: string) => void;
  onStartBooking?: ((startsAtInstant: string) => void) | undefined;
}

/**
 * DESKTOP layout — a day timeline with a leading time gutter and a trailing
 * action column, so the eye can scan "when" down one edge and "what to do"
 * down the other while the middle carries the state in words.
 *
 * Its mobile counterpart is {@link CalendarAgenda}, a different structure
 * rather than this one squeezed: see that file's header. The choice is made
 * at render time in `CalendarRoute` by viewport, exactly as
 * `app/shell/ShellLayout.tsx` picks Desktop or Mobile shell — never by CSS
 * alone (FR-031, AGENTS.md "mobile layouts are deliberate substitutions").
 *
 * The list is an ordinary `<ol>` of buttons, not an ARIA grid: Tab and
 * Shift+Tab move between slots, Enter/Space activates one, and there is no
 * bespoke roving-tabindex model to get wrong or to trap a keyboard user in.
 */
export function CalendarTimeline({
  entries,
  summary,
  onOpenBooking,
  onStartBooking,
}: CalendarLayoutProps): React.JSX.Element {
  return (
    <div className={styles["timeline"]} data-layout="desktop">
      <p className={styles["summary"]}>{summary}</p>
      <ol className={styles["timeline-list"]} aria-label="Day timeline">
        {entries.map((entry) => (
          <CalendarEntryItem
            key={entry.id}
            entry={entry}
            showActionHint
            onOpenBooking={onOpenBooking}
            onStartBooking={onStartBooking}
          />
        ))}
      </ol>
    </div>
  );
}
