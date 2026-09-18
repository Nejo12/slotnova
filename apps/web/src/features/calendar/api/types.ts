/**
 * Calendar-surface API types, derived ENTIRELY from the generated contract
 * (`@slotnova/contracts` -> `packages/contracts/src/generated/types.ts`,
 * itself produced from the committed OpenAPI document). Nothing here is a
 * hand-written DTO: every alias indexes into `paths`, so a contract change
 * breaks typecheck instead of silently drifting (ADR-013, FR-035).
 */
import type { paths } from "@slotnova/contracts";

/** `GET /v1/calendar` 200 body — the composed read model. */
export type CalendarView =
  paths["/v1/calendar"]["get"]["responses"][200]["content"]["application/json"];

/** A half-open `[start, end)` span of UTC instants. */
export type CalendarInterval = CalendarView["open"][number];

/** One occupied entry: the interval plus the Booking identity to navigate with. */
export type CalendarOccupiedEntry = CalendarView["occupied"][number];

/** `confirmed` | `completed` — a cancelled booking never appears on the Calendar. */
export type CalendarOccupiedStatus = CalendarOccupiedEntry["status"];

/** RFC 9457 `application/problem+json` body, as the contract declares it. */
export type ProblemDetails =
  paths["/v1/calendar"]["get"]["responses"][403]["content"]["application/problem+json"];
