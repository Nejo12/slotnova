# ADR-025 — Consume Nova-UI as the Shared Design-System Foundation

Status: Accepted

## Context

The original Phase 0/Phase 1 architecture assumed Slotnova would create and own local `packages/design-tokens` and `packages/ui` packages. Since that plan was frozen, the separate `Nejo12/nova-ui` repository has matured into a published, tested design-system package family with a real consumer in Klinnova and explicit Slotnova consumer intent.

The published packages are:

- `@nova-component/design-tokens`
- `@nova-component/ui`

Nova-UI is product-agnostic and React-runtime neutral. Its current public UI surface already covers a substantial portion of Slotnova's primitive needs, including Button, Badge, Card, Checkbox, Dialog, EmptyState, Fieldset, FormField, InlineAlert, Menu/Popover, Progress, Radio, Select, Skeleton, Textarea, TextInput, Toast, Tooltip and VisuallyHidden.

Slotnova's Figma file remains materially more product-specific than Nova's generic token layer. Slotnova Figma contains Light/Dark semantic variables for surfaces, actions and statuses plus product semantics such as Recovery and Appointment states. Therefore replacing Slotnova's Figma contract wholesale with Nova's current generic values would create visual drift and is explicitly rejected.

## Decision

Slotnova will consume Nova-UI as an external shared design-system dependency rather than creating a duplicate Slotnova-local primitive library.

### Ownership boundary

**Nova-UI owns:**

- product-agnostic reusable React primitives;
- reusable accessibility behavior embedded in primitive APIs;
- shared Nova-family design-token foundations;
- generic Storybook documentation and primitive-level tests;
- release/versioning of `@nova-component/ui` and `@nova-component/design-tokens`.

**Slotnova owns:**

- application shell and navigation composition;
- product routes and responsive product layouts;
- Booking, Calendar, Recovery, Client, Messaging, Payment and other domain-specific UI;
- Slotnova-only component compositions;
- Slotnova-specific theme aliases/overrides required to match the canonical Figma contract;
- integration tests proving the consumed Nova packages work in Slotnova.

### Visual authority

Figma remains the visual and interaction authority for Slotnova. Nova-UI is an implementation foundation, not permission to make Slotnova visually identical to Klinnova or to override approved Slotnova designs.

### Token layering

The target layering is:

```text
Nova primitive/shared tokens
        ↓
Nova generic semantic tokens
        ↓
Slotnova semantic theme aliases/overrides
        ↓
Slotnova application and domain UI
```

Slotnova-specific semantic names such as Recovery and Appointment states remain owned by Slotnova unless and until they become genuinely cross-product concepts.

The Slotnova token integration must be deterministic, checked in, reviewable and verifiable against the approved Figma variables. Raw color/motion values remain forbidden outside the designated token/theme layer.

### Promotion rule

A Slotnova-specific component is not promoted into Nova-UI merely because it is reusable inside Slotnova. Promotion requires product-agnostic semantics and concrete reuse evidence. Prefer evidence from more than one product or a clearly generic primitive contract. Product/domain components remain local.

### Version policy

Slotnova consumes published Nova packages at exact reviewed versions during Phase 1. Upgrades are bounded dependency changes with changelog review, compatibility verification and normal CI. Slotnova must not depend on unpublished local links or copy Nova-UI source into the repository.

React peer compatibility must be verified at each upgrade. Nova-UI currently supports React `>=18.3.0 <20`, which includes Slotnova's React 19 baseline.

### Code Connect

Figma Code Connect may be added for stable shared primitive mappings after the Figma↔Nova component mapping is reconciled. It is not required to begin Phase 1 implementation and must not map product-specific Figma compositions to generic primitives inaccurately.

## Consequences

Benefits:

- avoids duplicate design-system implementations across Nova products;
- reuses an already-tested package with a real production consumer;
- lets accessibility and primitive behavior improvements benefit multiple products;
- reduces Slotnova PR-12/PR-13 implementation volume;
- keeps Slotnova product UI focused on product semantics rather than rebuilding generic controls.

Costs/risks:

- Slotnova now has an external package-version dependency;
- Nova token defaults do not yet match Slotnova's full visual semantics, so a Slotnova theme/alias layer is required;
- component gaps must be classified carefully as generic Nova gaps vs Slotnova-local composition needs;
- Figma/Nova/code drift must be detected with explicit verification rather than assumed away.

## Supersession

This ADR supersedes only the ownership assumptions in ADR-002 and ADR-022 that require Slotnova-local `packages/ui` and `packages/design-tokens` implementations.

All other ADR-002 monorepo rules and ADR-022 semantic-token, deterministic-generation, Light/Dark and no-hand-edit principles remain in force.

## Founder decision

Approved 2026-09-12.
