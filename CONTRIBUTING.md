# Contributing to Slotnova

## Branching

Create branches from current `main` using a narrow prefix such as:

- `feat/...`
- `fix/...`
- `chore/...`
- `test/...`

Do not stack unrelated work onto an old branch.

## Pull requests

Each PR must:

- link one primary issue;
- describe the exact bounded scope;
- state what is intentionally out of scope;
- list tests run;
- call out any Figma node/page used as reference;
- include accessibility verification for changed interactive UI;
- include Light/Dark and mobile checks when relevant.

Large feature areas must be split into reviewable domain slices. Avoid "build all of X" PRs.

## Product changes

Implementation PRs should not silently reinterpret approved Figma behavior. If implementation reveals a genuine conflict or impossible interaction, document it in the issue and resolve the product decision before broadening scope.

## Quality gate

Before requesting review:

- TypeScript passes without unsafe escape hatches added for convenience.
- Tests for changed behavior pass.
- No unrelated lint/test regressions are introduced.
- Keyboard interaction remains coherent.
- Focus is visible.
- Interactive mobile controls are touch-safe.
- Error states explain what happened and preserve recoverable input.
- Semantic Light/Dark behavior is preserved.

## Merge policy

Auto-merge is prohibited. The founder manually merges approved PRs.
