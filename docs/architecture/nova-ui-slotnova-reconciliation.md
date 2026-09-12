# Nova-UI ↔ Slotnova Reconciliation Audit

Date: 2026-09-12
Status: Architecture/planning reconciliation for Phase 1
Related: ADR-025, issue #20

## 1. Conclusion

Adopt Nova-UI now, before Slotnova reaches the original PR-12/PR-13 implementation point.

The timing is favorable because Slotnova has completed toolchain/database/observability foundations but has not yet implemented its production design-token package, primitive library or application shell. Introducing Nova-UI now removes duplication without migrating already-shipped Slotnova UI.

Nova-UI is an implementation foundation. Slotnova Figma remains the visual/interaction authority.

## 2. Evidence reviewed

### Nova-UI

Repository: `Nejo12/nova-ui`

Published package family:

- `@nova-component/design-tokens`
- `@nova-component/ui`

Current UI package version observed during this audit: `0.3.0`.

Current public UI surface includes:

- Badge
- Button
- Card
- Checkbox
- Dialog
- EmptyState
- Fieldset
- FormField
- InlineAlert
- Menu
- Popover
- Progress
- Radio
- Select
- Skeleton / SkeletonRegion / DelayedReveal
- Textarea
- TextInput
- Toast
- Tooltip
- VisuallyHidden

Klinnova currently consumes `@nova-component/ui@0.3.0`, providing real consumer evidence.

### Slotnova Figma

Canonical file: `WDH7Ku5JXhUQeJ054GFLPd`

Plugin-API inspection returned **61 top-level pages**. Important groups include:

- `02 — Foundations`
- dedicated component-spec pages
- product pages for Dashboard through Settings
- `17 — Mobile`
- `18 — Prototypes`
- `19 — Implementation Handoff`

The Foundations page describes **100 variables · 3 collections · Light + Dark semantics · 9 type styles · 3 elevation levels**.

The implementation handoff already inventories screens, system states, domain transitions, responsive/component rules, interaction/accessibility rules and implementation batches.

## 3. Token reconciliation finding

Nova's current generic semantic tokens and Slotnova's approved Figma semantics are not equivalent.

Examples:

- Nova generic `color.actionPrimary` is a neutral action color.
- Slotnova Figma `Action/Primary` resolves to the Slotnova/KDS Oxblood palette.
- Slotnova Figma uses warm Paper/Cream surfaces rather than Nova's current neutral white/gray surface defaults.
- Slotnova Figma contains domain semantics including `Recovery/*` and `Appointment/*` states that should not become generic Nova tokens by default.

Therefore:

**Rejected:** import Nova token values and treat them as the complete Slotnova theme.

**Accepted:** reuse Nova's shared primitive/token foundation and add a deterministic Slotnova semantic theme/alias layer verified against Figma.

Target layering:

```text
Nova primitive/shared tokens
        ↓
Nova generic semantic tokens
        ↓
Slotnova semantic aliases/overrides
        ↓
Slotnova product UI
```

## 4. Figma component ↔ Nova mapping

### Direct or strong mappings

| Slotnova Figma concept | Nova-UI | Decision |
|---|---|---|
| Button | `Button` | consume Nova |
| Text Input | `TextInput` | consume Nova |
| Textarea | `Textarea` | consume Nova |
| Status Badge | `Badge` | consume Nova; Slotnova tone semantics remain local |
| Select | `Select` | consume Nova |
| Checkbox | `Checkbox` | consume Nova |
| Radio | `Radio` | consume Nova |
| Validation Feedback | `FormField` + `InlineAlert` where appropriate | compose/verify |
| Modal / Dialog | `Dialog` | consume Nova |
| Toast | `Toast` | consume Nova |
| Alert / Callout | `InlineAlert` | consume Nova |
| Skeleton | `Skeleton` / `SkeletonRegion` | consume Nova |
| Progress Indicator / Progress Bar | `Progress` | consume Nova where continuous progress semantics match |
| Popover | `Popover` | consume Nova |
| Menu / Context Menu | `Menu` | consume Nova |
| Tooltip | `Tooltip` | consume Nova |
| generic content card | `Card` | consume Nova when semantics fit |
| Empty/result state | `EmptyState` | consume Nova for the generic empty-state case |

### Requires composition, audit or a future generic primitive

| Slotnova Figma concept | Current position |
|---|---|
| Navigation Item | Slotnova shell composition initially; promote only if product-agnostic API is proven |
| Bottom Navigation Item | Slotnova mobile-shell composition initially |
| Metric Card | Slotnova product composition over Card/tokens |
| Appointment Block | Slotnova domain component; must remain local |
| Toggle | Nova gap candidate; verify cross-product evidence before adding |
| Date Picker | Nova gap candidate; needs interaction/accessibility contract review |
| Time Picker | Nova gap candidate; needs interaction/accessibility contract review |
| Search | compose from TextInput initially unless generic search behavior merits Nova primitive |
| Chip | compare semantics with Badge; add a separate Nova primitive only if interactive/selectable semantics differ materially |
| Selectable Card | likely composition; do not force into generic Card API prematurely |
| Drawer | Nova gap candidate; important for Slotnova responsive behavior |
| Banner | likely composition over InlineAlert/system-state treatment unless persistent page-level semantics justify a primitive |
| Spinner | Nova gap candidate; confirm whether Skeleton/Inline Loading already covers intended use |
| Inline Loading | compose/verify against DelayedReveal/Skeleton before adding primitive |
| Icon Button | audit whether Button API can represent it accessibly; otherwise generic Nova gap |
| Avatar | Nova gap candidate |
| Segmented Item | Nova gap candidate; verify product-agnostic segmented-control contract |

## 5. What remains Slotnova-local by rule

The following should not be moved into Nova-UI merely for reuse inside Slotnova:

- application shell
- route/navigation information architecture
- Calendar layouts
- Booking creation/review flows
- Appointment Block
- Recovery vacancy/offer UI
- Client-specific cards/records
- Payments/POS compositions
- Staff/Inventory/Analytics product components
- Slotnova-specific semantic status mapping
- Recovery and Appointment design tokens

## 6. Revised Phase 1 intent

The original PR-12/PR-13 plan assumed local design-system construction. Replace that intent with:

### PR-12 — Nova token foundation + Slotnova theme reconciliation

Keep task IDs T052–T054 but reinterpret them as:

- pin and consume the reviewed `@nova-component/design-tokens` version;
- create the Slotnova Figma→theme reconciliation/generation layer;
- generate/check deterministic Slotnova semantic aliases/overrides;
- preserve raw-color/raw-motion Stylelint enforcement;
- verify Light/Dark completeness and deterministic regeneration.

Do **not** create a duplicate general-purpose `packages/design-tokens` implementation.

### PR-13 — Nova-UI consumer foundation + proven gaps only

Keep task IDs T055–T057 but reinterpret them as:

- pin and consume the reviewed `@nova-component/ui` version;
- wire Storybook/component-test consumption where useful in Slotnova;
- prove primitive compatibility with Slotnova theme, keyboard/focus and accessibility contracts;
- implement Slotnova-local compositions where they are product-specific;
- open separate Nova-UI work only for genuine generic primitive gaps with product evidence;
- avoid copying Nova source into Slotnova.

### PR-14 — Slotnova application shell

PR-14 remains Slotnova-owned. It composes Nova primitives into the approved desktop/mobile shell and product IA. Nova-UI does not own Slotnova navigation semantics.

## 7. Version/upgrade policy

During Phase 1:

- consume exact reviewed Nova package versions;
- no local `link:`/workspace linkage to the Nova repository;
- no source copying;
- every upgrade reviews package changelogs and runs Slotnova's full relevant fast gates;
- React peer compatibility is mandatory;
- visual/token compatibility is verified against the checked-in Slotnova theme contract;
- breaking Nova changes require a bounded consumer migration PR.

## 8. Promotion policy for future Nova components

A component may move from Slotnova to Nova-UI only when:

1. its semantics are product-agnostic;
2. its API does not encode Slotnova domain concepts;
3. accessibility behavior belongs at primitive level;
4. there is concrete reuse evidence — preferably from multiple products, or a clearly universal primitive need;
5. migration does not force another product to inherit Slotnova visual or domain decisions.

Products discover reusable patterns; Nova standardizes proven primitives.

## 9. One-month Figma exploitation plan

The paid Figma month should be used primarily to freeze implementation contracts, not to create speculative new screens.

### Priority A — must complete during the subscription window

1. **Token export/reconciliation**
   - capture all local variable collections/modes;
   - normalize Slotnova semantic names and values;
   - classify each token as Nova-shared, Slotnova alias/override or product-only;
   - record Light/Dark coverage and unresolved aliases.

2. **Component mapping/gap audit**
   - complete the Figma↔Nova mapping for all component-spec pages;
   - identify only genuine Nova gaps;
   - avoid speculative component creation.

3. **Responsive contract freeze**
   - verify implementation-critical desktop/mobile behavior for Calendar, Booking, Clients, Recovery, Messaging, Payments, Staff and Settings;
   - record intentional mobile substitutions rather than relying on scaled desktop designs.

4. **State-matrix freeze**
   - verify empty, loading, no-results, error, offline/degraded, success, destructive-confirmation, permission-restricted and partial/stale states where applicable.

5. **Interaction/accessibility freeze**
   - keyboard/focus behavior;
   - overlay focus trapping/restoration;
   - safe destructive exits;
   - touch targets;
   - accessible naming;
   - form error/recovery behavior;
   - non-color-only status communication.

6. **Asset inventory/export**
   - logos/icons/illustrations/non-code assets required for implementation;
   - identify which assets should become code/icons vs retained files.

### Priority B — high-value if time remains

7. Add Code Connect mappings for stable shared primitives after the mapping is approved.
8. Add implementation annotations where behavior cannot be inferred from screenshots.
9. Review dark-mode parity and contrast across priority screens.
10. Export durable screenshots/reference artifacts for implementation-critical states if useful for regression review.

### Not a priority during the paid month

- speculative screens beyond the approved product roadmap;
- duplicating Nova components inside Figma solely to mirror code mechanically;
- backend/API/database design work;
- visual polish with no implementation or product decision impact.

## 10. Exit criteria for this reconciliation

This planning change is complete when:

- ADR-025 is accepted;
- ADR-002 and ADR-022 reference the revised ownership model;
- Phase 1 `plan.md`/`tasks.md` no longer instruct implementation of duplicate local generic UI/token packages;
- PR-12/PR-13 preserve the existing T052–T057 IDs and acceptance intent while consuming Nova;
- the Slotnova theme/token reconciliation contract is explicit;
- the duplicate PR-04 issue is cleaned up;
- PR-04 remains unchanged and can resume independent review.
