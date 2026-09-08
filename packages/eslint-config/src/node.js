// Node service / tooling flavour of the shared config.
// Adds Node globals. Deeper server rules arrive with `apps/api` / `apps/worker`.

import globals from "globals";
import { base } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const node = [
  ...base,
  {
    name: "slotnova/node",
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];

export default node;
