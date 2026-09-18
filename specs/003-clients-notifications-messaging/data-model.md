# Phase 3 Data Model

Names below are planning-level and may be adjusted within bounded implementation PRs without changing ownership/invariants.

## Clients

### clients
- id UUID PK
- workspace_id UUID NOT NULL
- display_name text NOT NULL
- status enum-like constrained text: active | archived
- version integer NOT NULL
- created_at / updated_at timestamptz

RLS ENABLE + FORCE. Unique constraints must include workspace scope where applicable.

### client_contacts
- id UUID PK
- workspace_id UUID NOT NULL
- client_id UUID NOT NULL
- channel constrained text: email | sms | phone (only channels actually implemented)
- value_display text NOT NULL
- value_normalized text NOT NULL
- is_primary boolean NOT NULL
- created_at / updated_at

No global uniqueness assumption across workspaces.

### client_communication_policies
- id UUID PK
- workspace_id UUID NOT NULL
- client_id UUID NOT NULL
- channel
- preference state
- suppressed_at / suppression_reason nullable
- lawful_basis / consent_state factual metadata
- captured_at / withdrawn_at nullable
- source / provenance
- quiet_hours_start / quiet_hours_end nullable local times
- quiet_hours_timezone nullable IANA zone
- frequency_cap_count / frequency_cap_window nullable policy inputs
- version integer

## Booking integration

### bookings
Add nullable `client_id` owned by Booking migration.

Invariant: when non-null, referenced Client must belong to the same workspace. Enforce with a database-safe same-workspace reference strategy rather than application-only checking. Existing rows remain null and valid.

## Notifications

### notification_templates
- id/key + version
- workspace scope only if customization is implemented; otherwise code/static ownership may be used initially
- purpose/channel
- provider-neutral content definition
- active state

Do not build a marketing template CMS in Phase 3.

### notifications
- id UUID PK
- workspace_id UUID NOT NULL
- client_id UUID nullable only where a non-client system notification is explicitly supported
- template_key / template_version
- channel
- purpose
- producer_key / idempotency_key
- eligibility_status
- eligibility_reason nullable
- next_eligible_at nullable
- rendered recipient/content snapshot or safe reference as required for durable send
- state
- conversation_id nullable seam
- created_at / updated_at

Unique: (workspace_id, producer_key/idempotency_key) for the bounded producer scope.

### notification_delivery_attempts
- id UUID PK
- workspace_id UUID NOT NULL
- notification_id UUID NOT NULL
- attempt_number integer NOT NULL
- provider_key
- provider_message_id nullable
- state
- idempotency_key
- attempted_at
- next_retry_at nullable
- error_code/classification nullable
- terminal boolean

Unique notification attempt number and durable idempotency semantics.

## Messaging

### message_threads
- id UUID PK
- workspace_id UUID NOT NULL
- client_id UUID nullable/required according to supported Phase-3 flow
- subject/title nullable
- state constrained text: open | closed
- created_at / updated_at
- version integer

### messages
- id UUID PK
- workspace_id UUID NOT NULL
- thread_id UUID NOT NULL
- author_kind constrained text
- author_id nullable where external counterpart has no Identity user
- client_id nullable provenance
- body text NOT NULL
- client_send_key/idempotency_key nullable but required for mutation endpoint
- created_at
- edited_at nullable only if editing is explicitly implemented

No notification delivery-attempt FK is required. A source notification seam belongs on thread/notification relation, not each message.

## Tenant isolation

Every tenant-owned table above has NOT NULL workspace_id and RLS ENABLE + FORCE. Real-PG tests must prove:
- workspace A cannot SELECT/INSERT/UPDATE/DELETE workspace B data;
- cross-workspace FK association fails;
- worker/elevated execution establishes explicit tenant context before tenant-owned operations.

## State transitions

Notification:
requested → suppressed | deferred | queued → sending → delivered/accepted | retryable_failed → queued | permanently_failed

Messaging thread:
open → closed; reopening is a separate explicit command if implemented.

No state machine collapses Notifications into Messaging.
