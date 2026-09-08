# Slotnova Product Handoff

## Canonical product/design sources

GitHub committed product/architecture specifications are the **agent-readable behavioral authority**.

Approved Figma is the **visual/interaction authority**:

- File: https://www.figma.com/design/WDH7Ku5JXhUQeJ054GFLPd
- `18 — Prototypes`: page id `3:21`
- `19 — Implementation Handoff`: page id `372:2`

Important tooling note: some generic Figma metadata/API surfaces have returned only `00 — Cover` for this file, while a Plugin API read verified **61 pages**, including the full product corpus and implementation handoff. An agent that cannot access the full Figma document must use this committed handoff/specification and must not infer that referenced designs are absent.

## Core product surfaces

1. Dashboard
2. Calendar
3. Booking
4. Clients
5. Waitlist & Recovery
6. Messaging
7. Payments & POS
8. Staff
9. Inventory
10. Marketing & Retention
11. Analytics
12. Settings

These are product/UI surfaces; backend bounded contexts are defined separately in ADR-012. In particular, Calendar and Settings are not backend domains, and Catalog/Notifications/Scheduling exist as backend ownership modules even though they are not standalone primary navigation items.

## Approved mobile information architecture

`Home · Calendar · Clients · Recovery · More`

Messaging, Payments, Staff, Inventory, Marketing, Analytics and Settings live under `More` on mobile unless a later founder-approved product decision changes the IA.

## Booking

Primary lifecycle:

`Draft → Review → Pending/Confirmed → Completed`

`Cancelled` and `No-show` are exceptional outcomes. Recovery is associated with newly available capacity and is not a Booking status.

## Recovery

Recovery begins from cancelled/unfilled capacity and is optimized around recovered revenue.

`Vacancy → value at risk → candidate ranking → offers → waiting → first valid acceptance → close competing offers → booking/calendar update → client-history update → attribution`

The first valid acceptance wins. Detailed concurrency/security/accounting invariants live in ADR-016/018 and `docs/architecture/domain-modeling.md`.

## Retention

Retention is not Recovery. Retention addresses existing-client return behavior through rebooking opportunities, lifecycle signals, targeted outreach and campaign attribution.

## Payments

Checkout is appointment/client anchored first; retail/POS lines are additive.

The visual prototype simplifies the happy path, while the backend/payment domain must support the fuller lifecycle required by ADR-015 and payment architecture: processing/additional-action, authorization/capture where provider model requires it, paid, receipt, partial/full refunds, void/dispute/failure without conflating Refund as a single Payment status.

## Inventory

Inventory is service-business stock management, not warehouse software. Every movement explains its operating cause: sale, service consumption, supplier delivery, damage/loss or manual correction.

## System-state baseline

Reusable states:

- Empty
- Loading
- No results
- Error
- Offline/degraded
- Success
- Destructive confirmation
- Permission restricted
- Partial/stale data

Representative real-state designs exist in Booking, Recovery, Messaging, Payments, Inventory and Settings in the full Figma corpus.

## Cross-product interaction rules

- progressive disclosure for optional/advanced fields
- compact review/check-answers for high-consequence actions
- no unnecessary review screens for low-risk editable actions
- preserve input when recoverable errors occur
- destructive confirmations name the consequence and keep a safe exit visible
- status cannot rely on color alone
- mobile uses deliberate stacked substitutions, not compressed desktop grids
- fixed mobile navigation must not cover primary actions
- reduced-motion preference must be respected

## Critical prototypes

Desktop and mobile prototypes exist for:

- Create booking
- Cancel → recover
- Checkout → payment/refund

Prototype page: `18 — Prototypes` (`3:21`).
