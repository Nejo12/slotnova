# Catalog Contract

## `GET /catalog/services`

- Auth: session + workspace. Capability: `catalog:read`.
- Input: query `?active=true|false` (optional filter), pagination cursor.
- Response `200`: `Service[]` (id, name, categoryId, durationMinutes,
  preBufferMinutes, postBufferMinutes, priceAmountMinor, priceCurrency,
  active).
- Failures: `401` (no session), `403` (missing capability) as
  `problem+json`.

## `GET /catalog/services/:id`

- Auth/capability: same as list.
- Response `200`: `Service` detail.
- Failures: `404` `problem+json` if not found or not in workspace scope
  (RLS makes cross-workspace ids indistinguishable from not-found).

## `POST /catalog/services`

- Auth: session + workspace. Capability: `catalog:manage`.
- Input: `{ name, categoryId?, durationMinutes, preBufferMinutes?,
  postBufferMinutes?, priceAmountMinor, priceCurrency }`.
- Response `201`: created `Service`.
- Idempotency: client-supplied `Idempotency-Key` header; a retried request
  with the same key returns the original `201`/`200` body, not a duplicate.
- Failures: `422` validation `problem+json` (duration/price invariants),
  `403` missing capability.

## `PATCH /catalog/services/:id`

- Auth/capability: `catalog:manage`.
- Input: partial `Service` fields, `active` toggle included.
- Response `200`: updated `Service`.
- Concurrency: not version-guarded — Service edits are not booking-blocking
  races (Booking snapshots duration/buffers at creation time,
  `data-model.md`), so last-write-wins is acceptable here; this is an
  explicit, documented exception, not an oversight.
- Failures: `404`, `422`, `403`.

## `GET /catalog/categories` / `POST /catalog/categories` — only if R-CAT accepted

- Same auth/capability pattern as Service list/create, scoped to
  `catalog:read` / `catalog:manage`.

## `GET /catalog/services/:id/add-ons` / `POST .../add-ons` — only if R-ADDON accepted

- Same auth/capability pattern; `POST` body includes the independently
  nullable `priceDeltaMinor` / `durationDeltaMinutes` pair.

## `GET /catalog/staff-service-capabilities` / `POST .../staff-service-capabilities`

- Auth: session + workspace. Capability: `catalog:manage`.
- `POST` input: `{ staffId, serviceId }`. Catalog validates `serviceId`
  belongs to the workspace; `staffId` is validated as a well-formed
  reference only (Catalog does not own or query staff profile data).
- Response `201`: created association.
- Failures: `409` if the association already exists (unique constraint),
  `422` if `serviceId` is invalid/inactive.
