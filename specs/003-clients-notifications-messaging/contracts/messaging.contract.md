# Messaging Contract

Planning shape; implementation is runtime-schema-first.

## Capabilities
Read: `messaging:read`  
Send/mutate: `messaging:send`

## Endpoints

### GET /v1/message-threads
Workspace-scoped bounded inbox listing with stable ordering and explicit empty state.

### POST /v1/message-threads
Creates a human conversation for a supported Client/context. Must be idempotent where a source notification or client-send key defines uniqueness.

### GET /v1/message-threads/{threadId}
Returns thread + paginated messages. Cross-tenant thread is indistinguishable from not-found.

### POST /v1/message-threads/{threadId}/messages
Sends/persists a human-authored message with client-generated idempotency key. Duplicate retry returns the same message.

### POST /v1/message-threads/{threadId}/close
Explicit state mutation; reopening, if supported, is a separate command.

### POST /v1/notifications/{notificationId}/reply
Optional reply seam. Creates or returns the linked Messaging thread and may append the first human reply atomically/idempotently. It never copies notification delivery attempts into messages.

## Semantics
- unsent drafts remain client-side and survive recoverable errors;
- authorship/provenance is explicit;
- provider-delivery retry remains Notifications-owned.
