import { CalendarEntryItem } from "./CalendarEntryItem.js";
import type { CalendarLayoutProps } from "./CalendarTimeline.js";
import styles from "./calendar.module.scss";

/**
 * MOBILE layout (<= 400px) — a stacked chronological agenda.
 *
 * This is a deliberate substitution for {@link CalendarTimeline}, not that
 * timeline compressed (FR-031):
 *
 * - no time gutter. A fixed leading column on a phone leaves a few
 *   characters for the content that actually matters, so the time moves to
 *   the top of each card and gets the full width;
 * - no trailing action column. The ENTIRE card is the touch target, sized
 *   to the repo's `--nova-control-touch-target` floor, and the action is
 *   carried by the row's accessible name instead of a column that would be
 *   too narrow to hit;
 * - the day summary leads the list as its own line rather than sitting
 *   beside it.
 *
 * Same entries, same primitive, same words — a different arrangement chosen
 * at render time by viewport.
 */
export function CalendarAgenda({
  entries,
  summary,
  onOpenBooking,
  onStartBooking,
}: CalendarLayoutProps): React.JSX.Element {
  return (
    <div className={styles["agenda"]} data-layout="mobile">
      <p className={styles["summary"]}>{summary}</p>
      <ol className={styles["agenda-list"]} aria-label="Day agenda">
        {entries.map((entry) => (
          <CalendarEntryItem
            key={entry.id}
            entry={entry}
            showActionHint={false}
            onOpenBooking={onOpenBooking}
            onStartBooking={onStartBooking}
          />
        ))}
      </ol>
    </div>
  );
}
