# Motion & Transition Standard

Motion supports comprehension and continuity. It must never slow down operational work.

## Layers

### CSS transitions
Use for small visual state changes: hover, focus, color, background, opacity and simple transforms.

### View Transitions API
Use selectively for route/page continuity when supported. Navigation must remain correct without animation.

### Motion for React
Use for drawers, bottom sheets, dialogs, list insertion/removal, layout interpolation, reordering and meaningful state transitions.

## Tokens

Define semantic motion tokens in the design-token package, for example:

```text
motion.duration.fast
motion.duration.normal
motion.duration.slow
motion.easing.standard
motion.easing.enter
motion.easing.exit
motion.spring.snappy
motion.spring.gentle
```

Product code should consume tokens/presets rather than invent arbitrary durations repeatedly.

## Rules

- respect `prefers-reduced-motion` globally
- no critical information exists only in animation
- avoid gratuitous looping or decorative motion in operator workflows
- preserve focus during transitions
- drawers/sheets/dialogs must not become interactive before their focus contract is valid
- route transitions must not interfere with browser history or deep linking
- loading animation must not cause layout shift where skeleton/layout preservation is possible
- exit animations must never delay high-consequence state commits

## Preferred character

Slotnova motion should feel quick, calm and operational: short easing for ordinary actions, slightly softer movement for contextual surfaces, and stronger visual emphasis only for consequential state changes such as recovery completion or payment confirmation.

## Testing

- reduced-motion path must be testable
- critical transitions require behavior tests independent of animation timing
- avoid brittle tests that assert exact animation frame timing
