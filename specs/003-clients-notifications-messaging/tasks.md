# Phase 3 Tasks & Bounded PR Sequence

Dependencies are strict. Each PR starts from current main after the previous PR is merged unless explicitly marked parallel-safe.

## PR-01 — Clients domain + persistence
T001 create Clients module boundary and public/application ports  
T002 add clients/contact/policy schema and migration  
T003 RLS ENABLE + FORCE + policies  
T004 repository/application commands + optimistic versioning  
T005 real-PG tenant isolation and workspace integrity tests  
T006 unit tests for normalization/policy primitives  

Hard boundary: no HTTP API, no frontend, no Booking mutation, no Notifications/Messaging tables.

## PR-02 — Clients API + contracts
T007 runtime request/response schemas  
T008 create/list/search/detail/update endpoints  
T009 server-authoritative clients capabilities  
T010 RFC 9457 error mapping + pagination/search rules  
T011 OpenAPI + generated contracts + drift checks  
T012 API authorization/integration tests  

Hard boundary: no frontend; no Booking association yet.

## PR-03 — Booking↔Client additive integration
T013 add nullable Booking-owned client reference  
T014 enforce same-workspace referential integrity  
T015 expose typed association in Booking runtime contracts  
T016 preserve all existing no-client Booking flows  
T017 real-PG historical-null/cross-tenant tests  
T018 rebooking application seam from Clients to Booking without Recovery logic  

Hard boundary: no fabricated backfill; no client auto-merge.

## PR-04 — Clients frontend
T019 Clients route/list/search/empty/error/loading states  
T020 client detail/create/edit forms  
T021 rebooking entry point using Booking public path/seam  
T022 workspace-scoped TanStack Query keys  
T023 ≤400px deliberate mobile composition + approved IA  
T024 keyboard/focus/axe/Light-Dark/reduced-motion tests  

## PR-05 — Notifications domain + persistence
T025 Notifications module boundary  
T026 notification intent/template/attempt schema  
T027 RLS ENABLE + FORCE + policies  
T028 eligibility decision model + Clients eligibility port  
T029 quiet-hours and frequency-cap policy evaluation  
T030 idempotent notification request persistence  
T031 real-PG isolation/idempotency tests  

Hard boundary: no live provider, no Messaging history.

## PR-06 — Notifications worker/provider seam
T032 provider-neutral render/dispatch port  
T033 existing outbox event(s) + event-catalog entries as required  
T034 existing pg-boss job(s) for delayed/retry dispatch  
T035 durable attempt state/backoff/terminal failure semantics  
T036 fake/test provider adapter only  
T037 duplicate-worker and retry integration tests  
T038 exact audit/PII-minimization assertions  

## PR-07 — Notifications API/operator read surface
T039 notification request/read schemas/endpoints needed by approved flows  
T040 capabilities + typed contracts  
T041 delivery state presentation where operator-facing evidence requires it  
T042 accessibility/error-state tests  

Hard boundary: no marketing campaign UI or template CMS.

## PR-08 — Messaging domain + persistence
T043 Messaging module boundary  
T044 thread/message schema  
T045 RLS ENABLE + FORCE + policies  
T046 create/list/open/send/close application commands  
T047 idempotent send + optimistic thread behavior where applicable  
T048 real-PG isolation/idempotency tests  

Hard boundary: no notification retry mechanics.

## PR-09 — Messaging API + contracts
T049 runtime schemas/endpoints  
T050 messaging capabilities  
T051 OpenAPI + generated contracts  
T052 authorization/error integration tests  

## PR-10 — Messaging frontend
T053 inbox/thread/new-message flows  
T054 draft preservation on recoverable failure  
T055 More/mobile IA placement  
T056 keyboard/focus/touch/axe/Light-Dark/reduced-motion tests  

## PR-11 — Notification→Messaging reply seam
T057 explicit source-notification→thread link  
T058 create-or-link conversation command with idempotency/concurrency proof  
T059 no delivery-attempt copying into message history  
T060 contract/UI integration only where supported by approved flow  
T061 cross-tenant and permission tests  

## PR-12 — Phase 3 E2E hardening & exit
T062 end-to-end Clients create/search/open/rebook journey  
T063 Booking↔Client backward-compatibility journey  
T064 eligibility/quiet-hours/frequency-cap worker journey  
T065 duplicate notification request/worker execution proof  
T066 Messaging inbox/thread/send/reply-seam journey  
T067 ≤400px mobile + accessibility evidence  
T068 tenant-table census updated for all Phase-3 owned tables  
T069 contract determinism/boundary/no-scope-leak review  
T070 exact-head fast/integration/e2e/heavy/security evidence  
T071 write Phase-3 exit record and SC-001…SC-012 matrix

## Deferred
Client merge/dedupe engine; Recovery ranking/offers; Marketing orchestration; Payments; production provider credentials; public client account/portal; broad campaign/template designer.
