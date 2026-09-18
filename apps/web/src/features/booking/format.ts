/**
 * Presentation-layer time/text formatting for the Booking surface.
 *
 * This is the ONLY place the browser's wall-clock <-> instant conversion
 * happens, and it is deliberately narrow. Phase-2 recurrence, DST and
 * interval algebra live in the Scheduling domain on the server
 * (`apps/api/src/modules/scheduling/domain`) and are NOT re-implemented
 * here: the browser reads a local wall-clock value from a
 * `<input type="datetime-local">`, converts it to a single UTC instant, and
 * the server validates and owns everything downstream. The hard prohibition
 * on raw `Date` covers domain scheduling code; a browser input adapter is
 * neither domain nor scheduling logic, and no other module in this feature
 * constructs a `Date` from user input.
 */

/**
 * Moves focus to a form control by its `id`.
 *
 * Nova's `TextInput` types its props as plain `InputHTMLAttributes`, which
 * does not include `ref`, so this surface addresses the control the same
 * way its `<label for>` already does rather than casting past the shared
 * component's public API or wrapping it in a bespoke local copy.
 */
export function focusFieldById(id: string): void {
  document.getElementById(id)?.focus();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `"2026-10-01T09:30"` (a LOCAL wall-clock value, per the HTML
 * datetime-local format) -> `"2026-10-01T07:30:00.000Z"`. Returns `null`
 * for an empty or unparseable value so the caller renders a field-level
 * validation error rather than submitting `Invalid Date`.
 */
export function localInputToInstant(value: string): string | null {
  if (value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Inverse of {@link localInputToInstant}, for prefilling a reschedule field. */
export function instantToLocalInput(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Human-readable date + time in the viewer's locale/zone. `Intl` is used
 * (not a hand-rolled formatter) so the value respects the operator's own
 * regional settings.
 */
export function formatInstant(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

/** `90` -> `"1 h 30 min"`; `45` -> `"45 min"`. */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest)} min`;
}

// NOTE: Service price is deliberately NOT formatted or displayed on this
// surface. Rendering `priceAmountMinor` would require minor-unit -> major-unit
// arithmetic (float-prohibited) plus a per-currency exponent the contract does
// not expose, and no accepted Phase-2 Booking evidence requires price in the
// create flow or on Booking detail. Payments (ADR-015) owns money presentation.
