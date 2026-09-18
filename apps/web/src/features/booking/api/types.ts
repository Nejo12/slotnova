/**
 * Booking-surface API types, derived ENTIRELY from the generated contract
 * (`@slotnova/contracts` -> `packages/contracts/src/generated/types.ts`,
 * itself produced from the committed OpenAPI document). Nothing here is a
 * hand-written DTO: every alias indexes into `paths`, so a contract change
 * breaks typecheck instead of silently drifting (ADR-013, FR-035).
 */
import type { paths } from "@slotnova/contracts";

/** `GET /v1/bookings/{id}` 200 body — the single Booking representation. */
export type Booking =
  paths["/v1/bookings/{id}"]["get"]["responses"][200]["content"]["application/json"];

/** `confirmed` | `completed` | `cancelled` — the only server lifecycle states. */
export type BookingStatus = Booking["status"];

/** One item of `GET /v1/catalog/services` 200 body. */
export type ServiceListItem =
  paths["/v1/catalog/services"]["get"]["responses"][200]["content"]["application/json"]["items"][number];

/** `GET /v1/catalog/services/{id}` 200 body. */
export type ServiceDetail =
  paths["/v1/catalog/services/{id}"]["get"]["responses"][200]["content"]["application/json"];

/** RFC 9457 `application/problem+json` body, as the contract declares it. */
export type ProblemDetails =
  paths["/v1/bookings"]["post"]["responses"][400]["content"]["application/problem+json"];

/** `POST /v1/bookings` request body: `serviceId` + `startsAt` and nothing else. */
export type CreateBookingRequest =
  paths["/v1/bookings"]["post"]["requestBody"]["content"]["application/json"];
