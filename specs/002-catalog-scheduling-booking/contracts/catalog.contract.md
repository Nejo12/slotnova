# Catalog Contract

Founder review note: staff-service capability and service add-on endpoints
from the first draft are removed from Phase-2 scope (see `research.md`
R-SCOPE, R-ADDON) — no concrete staff identity source exists on current
`main`, and no evidence justifies add-ons yet. Both are documented as
future extension points, not endpoints.

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

## `GET /catalog/categories` / `POST /catalog/categories`

- Auth: session + workspace. Capability: `catalog:read` / `catalog:manage`.
- `POST` input: `{ name, sortOrder? }`. No nesting/description/icon fields
  (Founder-finalized R-CAT).
- Response `201`: created category.

## Deferred — not part of Phase 2

- **Service add-ons** (`research.md` R-ADDON): no endpoint exists. If
  concrete Figma/product evidence later proves necessity, this section
  gains `GET/POST /catalog/services/:id/add-ons` with an independently
  nullable `priceDeltaMinor`/`durationDeltaMinutes` pair, added via its own
  additive migration and PR — not implied by this planning package.
- **Staff-service capability** (`research.md` R-SCOPE): no endpoint exists.
  Catalog does not validate, store, or expose any staff/service
  association in Phase 2. This is a documented future Catalog↔Staff
  application-port integration point, to be designed once a real staff
  identity source exists.
