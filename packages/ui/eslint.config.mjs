// packages/ui ESLint config: extends the shared react flavour and adds
// jsx-a11y + react-hooks, as anticipated by @slotnova/eslint-config's
// react.js ("introduced with apps/web and packages/ui").
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { react } from "@slotnova/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...react,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat.recommended,
  {
    name: "slotnova/ui",
    files: ["**/*.{ts,tsx}"],
  },
];
