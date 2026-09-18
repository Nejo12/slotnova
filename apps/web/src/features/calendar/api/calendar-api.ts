/**
 * The Calendar surface's only network layer. The single call goes through
 * the generated typed client (`createContractsClient`) against the committed
 * OpenAPI contract — no hand-written request/response shape, no second
 * `fetch` wrapper, no branching on human-readable error text.
 *
 * There is deliberately NO CSRF middleware here, unlike
 * `booking/api/booking-api.ts`: this surface issues exactly one request and
 * it is a GET. The double-submit header belongs on unsafe methods, and
 * attaching it to a read would be cargo-culted ceremony. If a mutation is
 * ever added to this surface it must be added WITH the header, not without.
 *
 * The session itself is the HttpOnly cookie, hence `credentials: "include"`.
 */
import { createContractsClient, type ContractsClient } from "@slotnova/contracts";

import { ApiProblemError, ApiTransportError } from "./problem.js";
import type { CalendarView } from "./types.js";

const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3001";

let cachedClient: ContractsClient | undefined;

export function calendarApiClient(): ContractsClient {
  cachedClient ??= createContractsClient({ baseUrl: API_BASE_URL, credentials: "include" });
  return cachedClient;
}

interface ContractResult<T> {
  readonly data?: T | undefined;
  readonly error?: unknown;
  readonly response: Response;
}

function unwrap<T>(result: ContractResult<T>): T {
  if (!result.response.ok) throw new ApiProblemError(result.error, result.response.status);
  if (result.data === undefined) {
    throw new ApiProblemError(result.error, result.response.status);
  }
  return result.data;
}

export interface CalendarWindow {
  /** Inclusive ISO-8601 instant. */
  readonly from: string;
  /** EXCLUSIVE ISO-8601 instant. */
  readonly to: string;
}

/**
 * One bounded window per request. There is no unbounded variant and no
 * `resourceId`/`locationId`/`staffId`/`clientId` parameter — the API rejects
 * any such property with `validation`, and Phase 2 has no such dimension.
 */
export async function fetchCalendar(window: CalendarWindow): Promise<CalendarView> {
  let result: ContractResult<CalendarView>;
  try {
    result = await calendarApiClient().GET("/v1/calendar", {
      params: { query: { from: window.from, to: window.to } },
    });
  } catch (cause) {
    throw new ApiTransportError(cause);
  }
  return unwrap(result);
}
