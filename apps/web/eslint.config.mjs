// apps/web ESLint config: extends the shared react flavour and adds
// jsx-a11y + react-hooks, matching packages/ui's config (PR-13).
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import { react } from "@slotnova/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...react,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat.recommended,
  {
    name: "slotnova/web",
    files: ["**/*.{ts,tsx}"],
  },
];
