# AGENTS.md

## Purpose

This repository implements Slotnova from the approved Figma product system. AI coding agents must preserve approved product behavior and keep changes bounded.

## Authority order

1. Current GitHub `main` for implementation state.
2. Approved Figma screens and `19 — Implementation Handoff` for product/UI behavior.
3. Linked GitHub issue for PR scope.
4. Explicit founder instruction when it changes prior decisions.

If these conflict, stop and surface the conflict rather than guessing.

## Product invariants

- Recovery and retention are different domains.
- Recovery lifecycle is vacancy → value at risk → ranking → offer → waiting → acceptance → close competing offers → booking update → recovered-revenue attribution.
- Mobile navigation is fixed to `Home · Calendar · Clients · Recovery · More` unless explicitly changed by the founder.
- Mobile layouts are intentional substitutions, not compressed desktop layouts.
- Light/Dark must be semantic-token driven.
- Destructive actions need explicit consequence communication and a safe exit path.
- System states must preserve user input where recovery is possible.

## Engineering baseline

- React + TypeScript
- Vite
- React Router
- SCSS/Sass; no Tailwind unless explicitly approved
- TanStack Query for server state
- Zustand only for justified client state
- Vitest + Testing Library
- MSW for API-boundary tests

Prefer strong typing, explicit domain models and small modules over broad abstractions.

## PR rules

- Start from current `main`.
- One bounded issue per PR.
- Do not mix product redesign with implementation.
- Do not change unrelated files to "clean things up".
- Add or update tests for behavior changed by the PR.
- Verify keyboard, focus, touch target and Light/Dark behavior for changed UI.
- Never enable auto-merge.
- Do not merge PRs. Founder merges manually.

## Figma implementation rules

- Reuse existing design-system primitives before creating new UI primitives.
- Preserve approved spacing, hierarchy and state semantics rather than copying generated utility-class code literally.
- Icon-only controls require accessible names.
- Dialogs/Drawers must move focus inside, trap focus while modal, support Escape when dismissal is allowed, and restore focus to the invoking control.
- Interactive mobile targets should be at least 44px in the relevant dimension.

## Testing expectations

At minimum for each domain slice:

- happy path
- one representative failure/error path
- relevant state transition tests
- keyboard/accessibility assertions where the changed component is interactive
- regression coverage for bug fixes

Do not treat visual-only screenshots as a replacement for behavioral tests.
