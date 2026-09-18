# Feature Specification: Phase 3 — Clients, Notifications & Messaging

Status: Draft — planning gate for issue #85, parent #4  
Authority order: constitution → accepted ADRs → `docs/product-handoff.md` → this package → tests

## Objective

Phase 3 adds three distinct bounded contexts: **Clients**, **Notifications**, and **Messaging**. This planning PR defines the behavioral, persistence, contract, authorization, privacy, delivery, and UI boundaries before implementation begins. It contains no runtime code or schema migration.

## Evidence basis

- Parent issue #4 and planning issue #85.
- `docs/phase-2-exit.md` and retained Phase-2 Founder decisions.
- `docs/product-handoff.md`.
- ADR-005, 006, 008, 009, 012, 013, 014, 017, 019, 021, 024 and architecture domain-modeling guidance.
- Existing transactional outbox, worker and pg-boss platform infrastructure.
- Figma pages 08 — Clients, 10 — Messaging, 18 — Prototypes, 19 — Implementation Handoff were attempted through generic metadata access; only `00 — Cover` was exposed. Per the committed handoff this is a tooling limitation, not evidence that designs are absent.

## Founder-retained constraints

1. Clients is a real customer/client domain; Identity memberships are not clients.
2. Booking↔Client is additive. Existing Phase-2 Bookings remain valid without a client.
3. No historical Client rows are fabricated from bookings, memberships, or operator identities.
4. Notifications and Messaging remain separate bounded contexts.
5. Notifications owns system-initiated transactional sends, provider delivery attempts, retry/idempotency, throttling and eligibility enforcement.
6. Messaging owns human conversation threads/messages. It does not own provider retry mechanics.
7. A notification MAY expose a reply seam that creates or links to a Messaging conversation; notification delivery history never becomes chat history.
8. No Recovery ranking/offers, Marketing campaign orchestration, Payments, or production provider credentials are in Phase 3.
9. Existing outbox/pg-boss infrastructure is reused; no second job platform is introduced.
10. Tenant-owned Phase-3 tables use RLS ENABLE + FORCE RLS.

## User stories

### US1 — Maintain a client directory (P1)

A capability-holding operator can create, search, open and update Client records in the active workspace.

Acceptance:
- Client records are workspace-owned and cross-tenant inaccessible.
- Search is server-side, bounded and deterministic.
- Contact data can be absent; empty states are explicit.
- Duplicate names/contact values do not trigger automatic merge.
- No operator membership is silently reinterpreted as a Client.

### US2 — Associate Booking with Client additively (P1)

An operator can associate an existing or new Booking with a Client where appropriate without invalidating existing Phase-2 rows.

Acceptance:
- Existing Bookings with no client continue to load and mutate.
- Association uses a Booking-owned nullable `client_id` or equivalent additive reference, introduced by a bounded Booking integration change.
- Cross-workspace Client association is impossible at both application and database boundaries.
- No backfill invents Clients for historical bookings.

### US3 — Manage communication eligibility (P1)

An operator can maintain contact channels, preference/suppression, lawful-basis/consent metadata, quiet hours and frequency-cap inputs owned by Clients.

Acceptance:
- Eligibility data is explicit and auditable.
- Legal metadata stores factual provenance/state, not inferred legal advice.
- Quiet hours are evaluated in an explicit IANA timezone.
- Opt-out/suppression overrides ordinary preference.
- Notifications reads Clients eligibility through an application port, not direct table access.

### US4 — Request a transactional notification (P1)

An authorized producer requests a transactional notification through Notifications.

Acceptance:
- Request is idempotent by producer-stable key.
- Notifications snapshots template/version + rendered payload inputs needed for durable processing while minimizing PII.
- Eligibility is evaluated server-side before provider dispatch.
- Ineligible notifications do not dispatch.
- Eligible notifications enqueue through existing outbox/job infrastructure.
- Provider failures produce durable retry/failure state without duplicating successful sends.

### US5 — Review delivery state (P2)

An operator can inspect a transactional notification and its delivery state without confusing it with a human conversation.

Acceptance:
- State distinguishes queued, suppressed/ineligible, sending, delivered/accepted, failed and permanently failed as supported by the provider seam.
- Retries are visible as delivery attempts, not duplicated notification records.
- Status never relies on color alone.

### US6 — Human messaging (P1)

Authorized operators can view Messaging inbox/thread surfaces and send human-authored messages.

Acceptance:
- Threads and messages are workspace-owned.
- Messages retain author/actor provenance.
- A message send is idempotent.
- Messaging stores conversation history but does not own notification provider retry queues.
- Empty/error states preserve unsent draft input.

### US7 — Reply seam (P2)

Where a transactional notification supports reply, the system can create or link a Messaging thread without copying delivery-attempt rows into chat history.

Acceptance:
- Linkage is explicit and nullable.
- One notification may point to at most one conversation seam for the supported flow.
- The resulting conversation is governed by Messaging permissions and ownership.

## Functional requirements

### Clients

- **FR-C01**: Client belongs to exactly one workspace.
- **FR-C02**: Client has stable id, display name, optional structured contact channels, lifecycle state, created/updated timestamps and optimistic version.
- **FR-C03**: Contact channels are normalized enough for matching/sending but raw user-visible values are preserved where needed.
- **FR-C04**: Clients owns communication eligibility inputs: channel preference, suppression/opt-out, consent/lawful-basis metadata, quiet hours and frequency-cap policy inputs.
- **FR-C05**: Automatic client dedupe/merge is deferred; duplicate detection may surface hints only if evidence later justifies it.
- **FR-C06**: Client search is workspace-scoped with bounded pagination.
- **FR-C07**: Rebooking entry point starts from Client UI but invokes Booking through a public/application boundary.
- **FR-C08**: Data erasure/pseudonymization follows ADR-019; immutable/audit records must not be silently hard-deleted.

### Booking integration

- **FR-B01**: Booking↔Client association is additive and nullable.
- **FR-B02**: Historical Phase-2 Bookings remain valid with no client.
- **FR-B03**: Association cannot cross workspaces.
- **FR-B04**: Booking remains owner of Booking persistence and lifecycle; Clients does not update Booking tables directly.

### Notifications

- **FR-N01**: Notification is a durable transactional intent, separate from provider attempts.
- **FR-N02**: Notifications owns template identity/version and rendering boundary; producers pass typed business inputs, not provider payloads.
- **FR-N03**: Eligibility enforcement calls Clients through an application port and records the decision basis required for auditability.
- **FR-N04**: Suppression/opt-out is absolute for channels where policy applies.
- **FR-N05**: Quiet hours defer dispatch rather than mutate the notification intent; next-eligible time is server-authoritative.
- **FR-N06**: Frequency caps are evaluated against durable send history and explicit policy inputs.
- **FR-N07**: Provider adapters are behind a Notifications port; no production provider credentials are added in Phase 3.
- **FR-N08**: At-least-once worker execution must be safe through idempotency keys and persisted attempt state.
- **FR-N09**: Retries use existing pg-boss/job infrastructure with bounded backoff and terminal failure.
- **FR-N10**: Notifications never stores human conversation history.

### Messaging

- **FR-M01**: Conversation thread belongs to one workspace and has explicit participants/reference targets appropriate to the implemented flow.
- **FR-M02**: Message belongs to one thread and records author kind/id, body, timestamps and idempotency key for sends.
- **FR-M03**: Human messages are distinct from notification delivery records.
- **FR-M04**: Reply seam may reference a source notification and create/link one conversation.
- **FR-M05**: Messaging permissions are server-authoritative.
- **FR-M06**: Draft text is client-side until send; recoverable errors preserve it.

## Authorization

Initial capabilities are explicit and server-enforced:
- `clients:read`, `clients:write`
- `notifications:read`, `notifications:send`
- `messaging:read`, `messaging:send`

Default role→capability mapping remains a separate Founder policy decision unless explicitly resolved in a bounded implementation issue. Tests grant required permissions explicitly.

## Success criteria

- **SC-001** Client create/search/open/update is isolated per workspace with real-PG RLS proof.
- **SC-002** Existing no-client Bookings remain valid; valid Client association succeeds; cross-tenant association fails.
- **SC-003** Communication eligibility correctly enforces suppression, preference, lawful-basis/consent state, quiet hours and frequency caps.
- **SC-004** Notification request + delivery retry is idempotent under duplicate producer request and duplicate worker execution.
- **SC-005** Notifications and Messaging remain separate in persistence, modules and contracts; no notification attempt becomes chat history.
- **SC-006** Messaging thread/message flows work with server-authoritative capabilities and RLS.
- **SC-007** Reply seam creates/links a conversation without duplicating notification history.
- **SC-008** Runtime schemas generate deterministic OpenAPI/`@slotnova/contracts` artifacts with drift checks green.
- **SC-009** Desktop and ≤400px mobile Clients/Messaging flows meet keyboard, focus, axe, Light/Dark and reduced-motion requirements.
- **SC-010** Recoverable empty/error states preserve user work.
- **SC-011** No Recovery ranking/offers, Marketing orchestration, Payments or production provider credentials enter the Phase-3 diff.
- **SC-012** Required CI passes on exact head and heavy lane remains within the Founder-approved 180s budget.

## Explicitly out of scope

Recovery candidate ranking/offers/acceptance; Marketing campaigns; Payments; provider credential provisioning; client auto-merge engine; public customer portal; broad CRM framework; arbitrary omnichannel workflow engine.
