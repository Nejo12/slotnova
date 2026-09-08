# Slotnova

Slotnova is an appointment-business operating platform for service businesses. The product combines scheduling, client management, waitlist/recovery, messaging, payments/POS, inventory, retention, analytics, staff operations and settings around one operating model.

## Source of truth

- Figma design system and product flows: https://www.figma.com/design/WDH7Ku5JXhUQeJ054GFLPd
- Implementation handoff: page `19 — Implementation Handoff`
- GitHub `main`: durable implementation state

Do not reinterpret approved product decisions during implementation unless current repository evidence or a founder decision requires it.

## Product principles

- Progressive disclosure over dense forms.
- One dominant operational task per screen.
- Recovery is distinct from retention.
- Recovery success is recovered revenue, not generic engagement.
- Mobile uses `Home · Calendar · Clients · Recovery · More`.
- Mobile is intentionally adapted, not a shrunken desktop.
- Light and Dark modes use semantic tokens.
- High-consequence actions require explicit review/confirmation.
- Accessibility is a release requirement, not a polish step.

## Frontend baseline

Initial implementation baseline:

- React + TypeScript
- Vite
- React Router
- SCSS/Sass
- TanStack Query
- Zustand where local client state is warranted
- Vitest + Testing Library
- MSW for API-boundary tests

Do not add Tailwind unless the founder explicitly changes this decision.

Persistence, authentication, payments provider and other infrastructure integrations are intentionally kept behind adapters until their implementation batch is reached.

## Delivery workflow

1. Work from current `main`.
2. One bounded issue per branch/PR.
3. Keep PR scope aligned to the linked issue.
4. Include tests for changed behavior and state transitions.
5. Include accessibility verification for changed UI.
6. Do not redesign approved Figma flows inside implementation PRs.
7. Never enable auto-merge.
8. Founder manually merges PRs.

See:

- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/product-handoff.md`
- `docs/implementation-plan.md`
- `.github/pull_request_template.md`
