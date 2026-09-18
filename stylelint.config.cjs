module.exports = {
  extends: ["./tooling/stylelint/index.cjs"],
  ignoreFiles: [
    "**/node_modules/**",
    "**/dist/**",
    // Storybook's production build output — a build artifact beside `dist`,
    // gitignored, but each linter carries its own ignore list (see the same
    // entry in packages/eslint-config/src/base.js).
    "**/storybook-static/**",
    "**/.turbo/**",
    "**/coverage/**",
    // Deliberately-violating fixtures for tooling/stylelint/__tests__/rules.test.ts
    // (T053) — inert, never imported by real code, excluded from the normal
    // workspace-wide `lint:styles` run the same way dependency-cruiser
    // excludes its own rule fixtures.
    "tooling/stylelint/__fixtures__/**",
  ],
};
