/**
 * TanStack Query binding for the Calendar surface (ADR-003: TanStack Query
 * is the ONLY server-state cache — nothing here keeps a second copy in
 * component state, and the Calendar persists nothing anywhere).
 *
 * The query is keyed through `./keys.ts`, i.e. workspace-scoped AND
 * range-scoped. There is no mutation on this surface: Calendar is a read.
 */
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { fetchCalendar, type CalendarWindow } from "./calendar-api.js";
import { calendarKey } from "./keys.js";
import { ApiProblemError } from "./problem.js";
import type { CalendarView } from "./types.js";

/**
 * A `session-invalid`/`forbidden`/`validation` answer is a decision, not a
 * blip: retrying it only delays the state the operator needs to see.
 */
function retryOnlyTransient(failureCount: number, error: Error): boolean {
  if (error instanceof ApiProblemError) return false;
  return failureCount < 2;
}

export function useCalendar(
  workspaceId: string,
  window: CalendarWindow,
  enabled = true,
): UseQueryResult<CalendarView, Error> {
  return useQuery({
    queryKey: calendarKey(workspaceId, window.from, window.to),
    queryFn: () => fetchCalendar(window),
    enabled,
    retry: retryOnlyTransient,
  });
}
