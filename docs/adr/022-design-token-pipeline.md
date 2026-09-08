# ADR-022 — Design Token Pipeline

Status: Proposed

## Context

Slotnova's Figma file already uses semantic variables. Manual transcription into CSS would drift quickly and undermine Light/Dark consistency.

## Decision

Use Figma Variables as the design source for semantic tokens and generate code artifacts through a deterministic checked-in pipeline (e.g. Figma Variables export → normalized token JSON → Style Dictionary or equivalent → `packages/design-tokens`). Generated artifacts are reviewed in PRs and never hand-edited.

Token names describe semantic purpose rather than literal values. Value-named tokens such as `radius-12px` must be renamed to semantic scale names before becoming canonical code tokens.

The pipeline covers color, typography, spacing/radius where represented, elevation and motion tokens. CSS custom properties are the runtime web output; theme modes map through semantic tokens rather than per-component overrides.

## Consequences

Requires a small generation tool and Figma access in the design-token workflow, but keeps Figma/code modes synchronized and enables Stylelint to ban raw values outside the token layer.
