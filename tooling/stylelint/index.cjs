/**
 * Shared Stylelint config for Slotnova (SCSS Modules + semantic design tokens).
 *
 * Task T053 (PR-12): the raw-value ban is now ON. Outside the designated
 * token/theme layer (`packages/design-tokens/**`, where the tokens
 * themselves are generated), raw colors and raw motion durations/easings
 * fail lint — Light/Dark stays semantic-token driven (ADR-022, ADR-025,
 * FR-005, FR-007, `docs/standards/ci-quality-gates.md`). `var(--...)` is
 * always accepted by the plugin, so token-based usage is unaffected.
 */
const STRICT_VALUE_RULE = [
  "scale-unlimited/declaration-strict-value",
  [
    [
      "/color$/i",
      "fill",
      "stroke",
      "box-shadow",
      "transition-duration",
      "transition-timing-function",
      "animation-duration",
      "animation-timing-function",
    ],
    {
      ignoreValues: ["currentColor", "transparent", "inherit", "initial", "unset", "none"],
      disableFix: true,
    },
  ],
];

module.exports = {
  extends: ["stylelint-config-standard-scss"],
  plugins: ["stylelint-declaration-strict-value"],
  rules: {
    [STRICT_VALUE_RULE[0]]: STRICT_VALUE_RULE[1],
  },
  overrides: [
    {
      // The designated token/theme layer: this is where semantic tokens are
      // DEFINED (generated CSS custom properties), so literal color/motion
      // values are expected here rather than banned. Never hand-edit the
      // generated file itself (ADR-022) — this exception exists for the
      // generator's own output, not for hand-authored component styles.
      files: ["packages/design-tokens/**/*.{css,scss}"],
      rules: {
        [STRICT_VALUE_RULE[0]]: null,
      },
    },
  ],
};
