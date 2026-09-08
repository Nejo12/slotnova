// Root ESLint flat config. Workspace units may add their own `eslint.config.mjs`
// that composes `@slotnova/eslint-config` flavours; this root config covers
// repo-level tooling and config files.

import { node } from "@slotnova/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...node,
  {
    name: "slotnova/root-tooling",
    files: ["tooling/**/*.{js,cjs,mjs,ts}", "*.{js,cjs,mjs,ts}"],
  },
];
