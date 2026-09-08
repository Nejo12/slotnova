/**
 * Shared Stylelint config for Slotnova (SCSS Modules + semantic design tokens).
 *
 * PR-01 is a SKELETON: `stylelint-config-standard-scss` gives baseline hygiene,
 * and the raw-value ban (colours + motion durations/easings outside the token
 * layer) is scaffolded below but DISABLED. Task T053 (PR-12) turns it on once
 * `packages/design-tokens` exists, so Light/Dark stays semantic-token driven
 * (ADR-022, FR-005, FR-007, `docs/standards/ci-quality-gates.md`).
 */
module.exports = {
  extends: ["stylelint-config-standard-scss"],
  plugins: ["stylelint-declaration-strict-value"],
  rules: {
    // --- Scaffold: enable in T053 once semantic tokens exist ---
    // "scale-unlimited/declaration-strict-value": [
    //   [
    //     "/color/",
    //     "fill",
    //     "stroke",
    //     "box-shadow",
    //     "transition-duration",
    //     "transition-timing-function",
    //     "animation-duration",
    //     "animation-timing-function",
    //   ],
    //   {
    //     ignoreValues: [
    //       "currentColor",
    //       "transparent",
    //       "inherit",
    //       "initial",
    //       "unset",
    //       "none",
    //     ],
    //     disableFix: true,
    //   },
    // ],
  },
};
