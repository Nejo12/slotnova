# Phase 3 Contract Index

These files define planning-level HTTP/behavioral boundaries. Runtime schemas implemented in code remain authoritative and generate OpenAPI/`@slotnova/contracts`.

- `clients.contract.md` — Client CRUD/search and Booking association/rebooking seam.
- `notifications.contract.md` — transactional notification request/read/delivery-state boundary.
- `messaging.contract.md` — human thread/message boundary and reply seam.

Rules:
- workspace comes from authenticated server context, never trusted request body;
- capability checks are server-authoritative;
- errors use RFC 9457 `application/problem+json`;
- mutation endpoints require deterministic idempotency/concurrency semantics;
- no contract exposes provider credentials or provider-native payloads.
