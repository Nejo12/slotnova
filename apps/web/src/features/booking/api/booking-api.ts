/**
 * The Booking surface's only network layer. Every call goes through the
 * generated typed client (`createContractsClient`) against the committed
 * OpenAPI contract — no hand-written request/response shape, no second
 * `fetch` wrapper, no branching on human-readable error text.
 *
 * Cross-cutting behaviour lives in ONE middleware rather than per call:
 * cookie credentials (the session is an HttpOnly cookie, never a stored
 * token) and the `x-csrf-token` double-submit header on every unsafe
 * method, mirroring `apps/api/src/modules/platform/security/csrf.ts`.
 */
import { createContractsClient, type ContractsClient } from "@slotnova/contracts";

import { readCsrfCookie } from "../../../app/auth/session-api.js";
import { ApiProblemError, ApiTransportError } from "./problem.js";
import type { Booking, ServiceDetail, ServiceListItem } from "./types.js";

const API_BASE_URL = import.meta.env["VITE_API_URL"] ?? "http://localhost:3001";
const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Upper bound for the Service picker's single page. The create flow shows
 * a bounded, selectable set of active Services; it deliberately does not
 * paginate (there is no accepted Catalog-browsing surface in Phase 2 and
 * PR-08 must not build Catalog management UI). If a workspace ever exceeds
 * this, the picker says so rather than silently truncating.
 */
const SERVICE_PAGE_LIMIT = 100;

let cachedClient: ContractsClient | undefined;

export function bookingApiClient(): ContractsClient {
  if (cachedClient === undefined) {
    const client = createContractsClient({ baseUrl: API_BASE_URL, credentials: "include" });
    client.use({
      onRequest({ request }) {
        if (!SAFE_METHODS.has(request.method.toUpperCase())) {
          request.headers.set(CSRF_HEADER_NAME, readCsrfCookie());
        }
        return request;
      },
    });
    cachedClient = client;
  }
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

async function call<T>(operation: () => Promise<ContractResult<T>>): Promise<T> {
  let result: ContractResult<T>;
  try {
    result = await operation();
  } catch (cause) {
    throw new ApiTransportError(cause);
  }
  return unwrap(result);
}

export interface ActiveServicesPage {
  readonly items: readonly ServiceListItem[];
  /** `true` when the workspace has more active Services than one page shows. */
  readonly truncated: boolean;
}

/**
 * Active Services only. `active=true` is the server-side filter; the extra
 * client-side `item.active` guard exists because an inactive Service must
 * never be offered as an ordinary selectable option even if a future
 * response shape changes — the server still rejects one with `validation`.
 */
export async function fetchActiveServices(): Promise<ActiveServicesPage> {
  const body = await call(() =>
    bookingApiClient().GET("/v1/catalog/services", {
      params: { query: { active: "true", limit: SERVICE_PAGE_LIMIT } },
    }),
  );
  const items = body.items.filter((item) => item.active);
  return { items, truncated: body.items.length >= SERVICE_PAGE_LIMIT };
}

export async function fetchService(id: string): Promise<ServiceDetail> {
  return call(() =>
    bookingApiClient().GET("/v1/catalog/services/{id}", { params: { path: { id } } }),
  );
}

export async function fetchBooking(id: string): Promise<Booking> {
  return call(() => bookingApiClient().GET("/v1/bookings/{id}", { params: { path: { id } } }));
}

export interface CreateBookingInput {
  readonly serviceId: string;
  readonly startsAt: string;
  /**
   * One key per intended creation. A transport retry of the SAME intent
   * reuses it (the server replays the original 201 and creates nothing
   * twice); a materially edited Service/time is a new intent and arrives
   * with a new key. See `create/submission-key.ts`.
   */
  readonly idempotencyKey: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  return call(() =>
    bookingApiClient().POST("/v1/bookings", {
      params: { header: { "Idempotency-Key": input.idempotencyKey } },
      // Exactly the two contract fields. Phase 2 has no client/customer,
      // resource, staff or location dimension, and the API rejects any
      // such property with `validation` (FR-029).
      body: { serviceId: input.serviceId, startsAt: input.startsAt },
    }),
  );
}

export interface BookingCommandInput {
  readonly id: string;
  readonly version: number;
}

/**
 * Reschedule changes `startsAt` and nothing else — the Service snapshot is
 * preserved server-side by design, so this surface never offers a Service
 * change here (contract: "The Service snapshot is NOT re-read").
 */
export async function rescheduleBooking(
  input: BookingCommandInput & { readonly startsAt: string },
): Promise<Booking> {
  return call(() =>
    bookingApiClient().POST("/v1/bookings/{id}/reschedule", {
      params: { path: { id: input.id } },
      body: { version: input.version, startsAt: input.startsAt },
    }),
  );
}

export async function cancelBooking(input: BookingCommandInput): Promise<Booking> {
  return call(() =>
    bookingApiClient().POST("/v1/bookings/{id}/cancel", {
      params: { path: { id: input.id } },
      body: { version: input.version },
    }),
  );
}

export async function completeBooking(input: BookingCommandInput): Promise<Booking> {
  return call(() =>
    bookingApiClient().POST("/v1/bookings/{id}/complete", {
      params: { path: { id: input.id } },
      body: { version: input.version },
    }),
  );
}
