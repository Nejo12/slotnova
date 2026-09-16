# Phase 2 API Contracts

All endpoints follow ADR-013: runtime (Zod-compatible) schemas at the API
boundary generate OpenAPI, which generates `@slotnova/contracts` client
artifacts; no hand-written duplicate DTOs. All failures use
`application/problem+json` (see `problem+json.contract.md` in
`specs/001-platform-foundation-shell/contracts/` for the shared shape —
Phase 2 reuses it, does not redefine it).

Every endpoint requires an authenticated session (ADR-007) and an active
workspace context (ADR-008) unless stated otherwise. Every endpoint's
capability requirement is enforced server-side (ADR-009); no endpoint is
authorized by client-supplied role claims.

- `catalog.contract.md` — Service/Category/AddOn/StaffServiceCapability
- `scheduling.contract.md` — AvailabilityPattern/AvailabilityException
- `booking.contract.md` — Booking lifecycle
- `calendar.contract.md` — read-composition endpoint (`research.md` R-CAL)

No state-changing endpoint uses HTTP GET (AGENTS.md hard prohibition).
