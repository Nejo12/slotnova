// React / browser flavour of the shared config.
// Adds browser globals. React-specific plugins (react-hooks, jsx-a11y) are
// introduced with `apps/web` and `packages/ui`, not in PR-01.

import globals from "globals";
import { base } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const react = [
  ...base,
  {
    name: "slotnova/react",
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];

export default react;
