# dependency-cruiser rule fixtures

Each subdirectory is a **self-contained mini-tree** that reproduces exactly one
architecture-boundary violation. `../__tests__/rules.test.ts` (task T006) cruises
each fixture with its own `baseDir` and asserts the matching rule from
`../.dependency-cruiser.cjs` fires. `compliant/` must produce **zero** violations.

These files are intentionally "wrong" — they are excluded from `tsc`, ESLint,
Prettier and the normal `pnpm lint:boundaries` run.
