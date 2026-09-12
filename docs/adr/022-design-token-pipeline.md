# ADR-022 — Design Token Pipeline

Status: Accepted

> **Amended by ADR-025 (2026-09-12):** Slotnova consumes Nova's published design-token foundation and adds a deterministic Slotnova theme/semantic reconciliation layer where the canonical Figma contract differs. This replaces the assumption that Slotnova must own a standalone local `packages/design-tokens` implementation. The semantic-token and deterministic-verification requirements below remain in force.

## Context

Slotnova's Figma file already uses semantic variables. Manual transcription into CSS would drift quickly and undermine Light/Dark consistency.

Since this ADR was accepted, `@nova-component/design-tokens` has become the shared Nova-family token package. Its generic semantic layer does not fully cover or visually match Slotnova's approved Figma variables, including Slotnova-specific Recovery and Appointment semantics, so direct replacement is not acceptable.

## Decision

Use Figma Variables as the Slotnova design source for product-specific semantic intent and reconcile them deterministically with the published Nova token foundation defined by ADR-025.

The pipeline is conceptually:

```text
Figma Variables
    ↓
normalized Slotnova token/alias contract
    ↓
@nova-component/design-tokens + Slotnova aliases/overrides
    ↓
CSS custom properties consumed by Slotnova
```

Generated/reconciled artifacts are checked in, reviewed in PRs and never hand-edited.

Token names describe semantic purpose rather than literal values. Value-named tokens such as `radius-12px` must be renamed to semantic scale names before becoming canonical code tokens.

The reconciliation covers color, typography, spacing/radius where represented, elevation and motion tokens. CSS custom properties are the runtime web output; theme modes map through semantic tokens rather than per-component overrides.

Generic Nova values may be reused when they faithfully represent the approved Slotnova design. Slotnova-specific aliases/overrides remain local when required for visual fidelity or product semantics. Product-specific names such as Recovery and Appointment states are not promoted into Nova merely to remove local tokens.

A deterministic verification step must detect drift between the checked-in Slotnova theme contract and the approved Figma variables.

## Consequences

Benefits: Figma/code modes stay synchronized; Slotnova reuses the shared Nova design-system base; product-specific semantics remain explicit; Stylelint can continue to ban raw values outside the designated token/theme layer.

Costs: requires a small reconciliation/generation tool and periodic Figma access when approved design variables change. Nova package upgrades must be reviewed against the Slotnova token map rather than assumed compatible.
