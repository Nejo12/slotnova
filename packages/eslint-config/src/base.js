// Shared base ESLint flat config for every Slotnova workspace unit.
//
// Scope for PR-01: language-level correctness + intra-module import hygiene
// (`import-x/no-cycle`), plus a hard stop on unused/blanket disable directives.
// Cross-package / cross-module architecture boundaries (UI -> db, domain ->
// provider SDK, module A -> module B repository, deep imports past a public
// entry, server-observability -> browser) are enforced mechanically by
// dependency-cruiser (`tooling/dependency-cruiser/.dependency-cruiser.cjs`,
// task T005), not by ESLint.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importX, { createNodeResolver } from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier";

// `import-x` rules (notably `no-cycle`) need a resolver that understands the
// `exports` field and NodeNext's `.js` -> `.ts` mapping. The plugin's legacy
// default node resolver does neither and throws on any dependency published
// exports-only (for example `msw`). Use the bundled unrs-resolver instead.
const nodeResolver = createNodeResolver({
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".node"],
  extensionAlias: {
    ".js": [".ts", ".tsx", ".js"],
    ".mjs": [".mts", ".mjs"],
    ".cjs": [".cts", ".cjs"],
  },
  conditionNames: ["types", "import", "require", "node", "default"],
});

/** @type {import("eslint").Linter.Config[]} */
export const base = tseslint.config(
  {
    name: "slotnova/ignores",
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.output/**",
      // dependency-cruiser test data: deliberately broken import graphs.
      "**/__fixtures__/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: "slotnova/base",
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [nodeResolver],
    },
    linterOptions: {
      // No convenience `eslint-disable`: an unused directive is an error.
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "import-x/no-cycle": ["error", { maxDepth: Number.POSITIVE_INFINITY }],
      "import-x/no-relative-packages": "error",
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);

export default base;
