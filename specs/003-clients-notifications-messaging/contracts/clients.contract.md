# Clients Contract

Planning shape; implementation is runtime-schema-first.

## Capabilities
Read: `clients:read`  
Mutate: `clients:write`

## Endpoints

### POST /v1/clients
Create a workspace-owned Client. Body contains display name and optional contact/policy inputs. Server assigns workspace.

Responses: 201; 400 validation; 403 capability; 409 idempotency/stale conflict where applicable.

### GET /v1/clients
Workspace-scoped bounded pagination and search. Query may include `q`, status, cursor/limit. Stable ordering required.

### GET /v1/clients/{clientId}
Returns Client detail + contact/policy state. 404 must not reveal cross-tenant existence.

### PATCH /v1/clients/{clientId}
Versioned update. Stale version → 409.

### POST /v1/bookings/{bookingId}/client
Booking-owned association command exposed through Booking API/module. Body: clientId + booking version if Booking contract requires it. Existing null association is valid. Cross-workspace reference rejected.

### POST /v1/clients/{clientId}/rebook-intent
Optional thin navigation/application seam only if needed by UI. Must not create Recovery offers or bypass Booking creation rules.

## Contract invariants
- no Identity membership fields masquerade as Client identity;
- no automatic merge;
- contact/legal metadata provenance is preserved;
- erasure/pseudonymization is not modeled as ordinary hard delete.
