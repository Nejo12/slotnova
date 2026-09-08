# Slotnova Product Handoff

## Canonical design source

Figma: https://www.figma.com/design/WDH7Ku5JXhUQeJ054GFLPd

Implementation handoff lives on page `19 — Implementation Handoff`.

## Core product domains

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

## Approved mobile information architecture

`Home · Calendar · Clients · Recovery · More`

Messaging, Payments, Staff, Inventory, Marketing, Analytics and Settings live under `More` on mobile unless a later product decision explicitly changes the IA.

## Important domain distinctions

### Booking

Primary lifecycle:

`Draft → Review → Created/Pending → Confirmed → Completed`

`Cancelled` and `No-show` are exceptional outcomes, not normal forward lifecycle stages.

### Recovery

Recovery begins from cancelled/unfilled capacity and is optimized around recovered revenue.

`Vacancy → value at risk → candidate ranking → offer → waiting → acceptance → close competing offers → booking/calendar update → client-history update → recovered-revenue attribution`

The first valid acceptance wins.

### Retention

Retention is not Recovery.

Retention addresses existing-client return behavior through rebooking opportunities, lifecycle signals, targeted outreach and campaign attribution.

### Payments

Checkout is anchored to appointment/client context first; retail/POS additions are secondary.

`Checkout → Processing → Paid → Receipt → Refund → Refunded`

### Inventory

Inventory is service-business stock management, not warehouse software. Stock movements should explain their operating cause: POS sale, service consumption, supplier delivery, damage/loss or manual correction.

## System-state baseline

Reusable system states:

- Empty
- Loading
- No results
- Error
- Offline/degraded
- Success
- Destructive confirmation
- Permission restricted
- Partial/stale data

Representative real-state designs already exist in Booking, Recovery, Messaging, Payments, Inventory and Settings.

## Cross-product interaction rules

- Progressive disclosure for optional/advanced fields.
- Compact review/check-answers for high-consequence actions.
- Do not insert review screens into low-risk editable actions.
- Preserve input when a recoverable error occurs.
- Destructive confirmations name the consequence and keep a safe exit path visible.
- Status cannot rely on color alone.
- Mobile uses deliberate stacked summaries instead of compressed desktop grids.
- Fixed mobile navigation must not cover primary actions.

## Critical prototype journeys

Desktop and mobile prototypes exist for:

- Create booking
- Cancel → recover
- Checkout → payment/refund

Prototype page: `18 — Prototypes`.
